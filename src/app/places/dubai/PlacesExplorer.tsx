"use client";
/* eslint-disable @next/next/no-img-element -- Google Places photo URLs are transient. */

import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Compass,
  ExternalLink,
  Heart,
  Images,
  Map as MapIcon,
  LocateFixed,
  MapPin,
  Maximize2,
  Search,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DubaiPlace, PlaceCategory, PlacesPayload } from "@/data/places-dubai";
import {
  TahoeGlassButton,
  TahoeGlassProvider,
  TahoeGlassSurface,
  useTahoeModalAccessibility,
  type TahoeGlassWebGLSource,
} from "@/components/ui/tahoe-glass";
import { ToastViewport } from "@/components/ui/Toast";
import styles from "./places.module.css";

type CategoryMeta = {
  label: string;
  shortLabel: string;
  color: string;
};

type PhotoCredit = {
  displayName: string;
  uri: string | null;
};

type DataAttribution = {
  provider: string;
  uri: string | null;
};

type PlacePhoto = {
  url: string;
  credits: PhotoCredit[];
  googleMapsUri: string | null;
  flagContentUri: string | null;
};

type LiveDetails = {
  selectionId: string;
  address: string;
  mapsUri: string;
  placeId: string | null;
  photos: PlacePhoto[];
  dataAttributions: DataAttribution[];
};

const CATEGORY_META: Record<PlaceCategory, CategoryMeta> = {
  "food-drink": { label: "Food & drink", shortLabel: "Eat", color: "#d46643" },
  "nature-wildlife": { label: "Nature & wildlife", shortLabel: "Nature", color: "#4f7955" },
  "beach-water": { label: "Beach & water", shortLabel: "Water", color: "#2f7f92" },
  "mountain-hiking": { label: "Mountains & hiking", shortLabel: "Hike", color: "#706957" },
  "arts-culture-heritage": { label: "Arts & culture", shortLabel: "Culture", color: "#865b8e" },
  "shows-immersive": { label: "Shows & immersive", shortLabel: "Shows", color: "#b85270" },
  "creative-workshop": { label: "Creative workshops", shortLabel: "Make", color: "#b97a36" },
  wellness: { label: "Wellness", shortLabel: "Reset", color: "#668078" },
  "resort-beach-club": { label: "Resorts & beach clubs", shortLabel: "Stay", color: "#456080" },
  "sport-active": { label: "Sport & active", shortLabel: "Move", color: "#c45d3c" },
  "shopping-stroll": { label: "Strolls & shopping", shortLabel: "Stroll", color: "#9a7048" },
  "family-animals": { label: "Animals & family", shortLabel: "Play", color: "#58877a" },
  "date-ideas": { label: "Other date ideas", shortLabel: "More", color: "#747871" },
};

const DEFAULT_CENTER = { lat: 24.6537, lng: 54.918 };
const UAE_BOUNDS = {
  north: 26.3,
  south: 22.6,
  east: 56.6,
  west: 51.5,
};
const DATABASE_ONLY_MAP_STYLES: google.maps.MapTypeStyle[] = [
  {
    featureType: "poi",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "transit",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "administrative.neighborhood",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "administrative.locality",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "administrative.land_parcel",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "landscape.man_made",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
];
const STORAGE_KEY = "nsso-uae-place-favourites";
let mapsConfigured = false;

function proxiedPlacePhoto(url: string) {
  return `/api/places/photo?url=${encodeURIComponent(url)}`;
}

function categoryFor(place: DubaiPlace) {
  return CATEGORY_META[place.taxonomy.primary] || CATEGORY_META["date-ideas"];
}

function haversineKm(
  pointA: { lat: number; lng: number },
  pointB: { lat: number; lng: number },
) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const latitudeDelta = radians(pointB.lat - pointA.lat);
  const longitudeDelta = radians(pointB.lng - pointA.lng);
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(pointA.lat)) *
      Math.cos(radians(pointB.lat)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function directionsUrl(place: DubaiPlace, placeId: string | null) {
  const params = new URLSearchParams({
    api: "1",
    destination: `${place.coordinates.lat},${place.coordinates.lng}`,
  });
  if (placeId) params.set("destination_place_id", placeId);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function markerNode(place: DubaiPlace, selected: boolean) {
  const node = document.createElement("button");
  const category = categoryFor(place);
  node.type = "button";
  node.tabIndex = window.matchMedia("(max-width: 900px)").matches ? -1 : 0;
  node.className = `${styles.mapMarker}${selected ? ` ${styles.mapMarkerSelected}` : ""}`;
  node.style.setProperty("--marker-color", category.color);
  node.setAttribute("aria-label", `Open ${place.name}`);
  node.title = place.name;
  node.innerHTML = `<span></span>`;
  return node;
}

function createMapOverlay(
  OverlayView: typeof google.maps.OverlayView,
  options: {
    map: google.maps.Map;
    position: google.maps.LatLngLiteral;
    node: HTMLElement;
    zIndex: number;
    centered?: boolean;
    interactive?: boolean;
  },
) {
  const overlay = new OverlayView();
  const container = document.createElement("div");
  const position = new google.maps.LatLng(options.position);
  container.className = `${styles.mapMarkerOverlay}${options.centered ? ` ${styles.mapMarkerOverlayCentered}` : ""}`;
  container.style.zIndex = String(options.zIndex);
  container.appendChild(options.node);

  overlay.onAdd = () => {
    const panes = overlay.getPanes();
    const pane = options.interactive === false ? panes?.markerLayer : panes?.overlayMouseTarget;
    pane?.appendChild(container);
    if (options.interactive !== false) {
      OverlayView.preventMapHitsFrom(container);
    }
  };
  overlay.draw = () => {
    const point = overlay.getProjection().fromLatLngToDivPixel(position);
    if (!point) return;
    container.style.left = `${Math.round(point.x)}px`;
    container.style.top = `${Math.round(point.y)}px`;
  };
  overlay.onRemove = () => container.remove();
  overlay.setMap(options.map);
  return { overlay, container, node: options.node };
}

type MapOverlayHandle = ReturnType<typeof createMapOverlay>;
type PlaceMarkerHandle = MapOverlayHandle & { placeId: string };

export default function PlacesExplorer({ payload }: { payload: PlacesPayload }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  const mapElementRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<PlaceMarkerHandle[]>([]);
  const userMarkerRef = useRef<MapOverlayHandle | null>(null);
  const lastAutoFitSignatureRef = useRef<string | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  const suppressGalleryClickRef = useRef(false);
  const galleryRegionRef = useRef<HTMLDivElement>(null);
  const galleryTriggerRef = useRef<HTMLButtonElement>(null);
  const lightboxRef = useRef<HTMLDivElement>(null);
  const lightboxCloseRef = useRef<HTMLButtonElement>(null);
  const mobileBrowseButtonRef = useRef<HTMLElement>(null);
  const mobileMapButtonRef = useRef<HTMLElement>(null);
  const detailCloseRef = useRef<HTMLElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<PlaceCategory | "all">("all");
  const [emirate, setEmirate] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const [favourites, setFavourites] = useState<Set<string>>(new Set());
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [liveDetails, setLiveDetails] = useState<LiveDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [failedPhotoUrls, setFailedPhotoUrls] = useState<Set<string>>(new Set());
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);

  useTahoeModalAccessibility({
    open: galleryOpen,
    panelRef: lightboxRef,
    initialFocusRef: lightboxCloseRef,
    modal: true,
    closeOnEscape: true,
    restoreFocus: true,
    hideBackground: false,
    onOpenChange: setGalleryOpen,
  });

  const places = payload.places;
  const selectedPlace = selectedId ? places.find((place) => place.id === selectedId) || null : null;
  const currentDetails = liveDetails?.selectionId === selectedPlace?.id ? liveDetails : null;
  const photos = currentDetails?.photos || [];
  const activePhoto = photos[activePhotoIndex] || null;
  const activePhotoUnavailable = activePhoto ? failedPhotoUrls.has(activePhoto.url) : false;
  const activePhotoSceneUrl = activePhoto ? proxiedPlacePhoto(activePhoto.url) : null;
  const activePhotoWebglSource = useMemo<TahoeGlassWebGLSource | undefined>(
    () => activePhotoSceneUrl
      ? {
          kind: "image",
          src: activePhotoSceneUrl,
          fit: "cover",
          label: "place-photo",
        }
      : undefined,
    [activePhotoSceneUrl],
  );
  const emirates = useMemo(
    () => [...new Set(places.map((place) => place.emirate))].sort(),
    [places],
  );

  const categoryCounts = useMemo(() => {
    const counts = new Map<PlaceCategory, number>();
    places.forEach((place) => {
      new Set(place.taxonomy.tags).forEach((tag) => {
        counts.set(tag, (counts.get(tag) || 0) + 1);
      });
    });
    return counts;
  }, [places]);

  const visibleCategories = useMemo(
    () =>
      (Object.entries(CATEGORY_META) as [PlaceCategory, CategoryMeta][])
        .filter(([key]) => categoryCounts.has(key))
        .sort((a, b) => (categoryCounts.get(b[0]) || 0) - (categoryCounts.get(a[0]) || 0)),
    [categoryCounts],
  );

  const filteredPlaces = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const next = places.filter((place) => {
      if (category !== "all" && !place.taxonomy.tags.includes(category)) return false;
      if (emirate !== "all" && place.emirate !== emirate) return false;
      if (favouritesOnly && !favourites.has(place.id)) return false;
      if (!normalizedQuery) return true;
      return [
        place.name,
        place.aliases.join(" "),
        place.address,
        place.locationHint,
        place.description,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });

    if (userLocation) {
      return [...next].sort(
        (a, b) => haversineKm(userLocation, a.coordinates) - haversineKm(userLocation, b.coordinates),
      );
    }
    return next;
  }, [category, emirate, favourites, favouritesOnly, places, query, userLocation]);

  const activeFilterCount = useMemo(
    () =>
      Number(Boolean(query.trim())) +
      Number(category !== "all") +
      Number(emirate !== "all") +
      Number(favouritesOnly),
    [category, emirate, favouritesOnly, query],
  );

  const openMobilePanel = useCallback(() => {
    setSelectedId(null);
    setMobilePanelOpen(true);
  }, []);

  const closeMobilePanel = useCallback(() => {
    setMobilePanelOpen(false);
    window.requestAnimationFrame(() => mobileBrowseButtonRef.current?.focus());
  }, []);

  const closeSelectedPlace = useCallback(() => {
    setSelectedId(null);
    if (window.matchMedia("(max-width: 900px)").matches) {
      window.requestAnimationFrame(() => mobileBrowseButtonRef.current?.focus());
    }
  }, []);

  const selectPlace = useCallback((placeId: string) => {
    setMobilePanelOpen(false);
    setSelectedId(placeId);
  }, []);

  const filterSignature = useMemo(
    () => filteredPlaces.map((place) => place.id).sort().join("|"),
    [filteredPlaces],
  );

  const fitVisiblePlaces = useCallback(() => {
    if (!map || !filteredPlaces.length) return;
    if (filteredPlaces.length === 1) {
      map.moveCamera({ center: filteredPlaces[0].coordinates, zoom: 14 });
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    filteredPlaces.forEach((place) => bounds.extend(place.coordinates));
    const isMobile = window.matchMedia("(max-width: 900px)").matches;
    if (isMobile) {
      const northEast = bounds.getNorthEast();
      const southWest = bounds.getSouthWest();
      const mapRect = map.getDiv().getBoundingClientRect();
      const availableWidth = Math.max(1, mapRect.width - 84);
      const availableHeight = Math.max(1, mapRect.height - 196);
      const latitudeRadians = (latitude: number) => {
        const sine = Math.sin((latitude * Math.PI) / 180);
        return Math.log((1 + sine) / (1 - sine)) / 2;
      };
      const latitudeFraction = Math.max(
        0,
        (latitudeRadians(northEast.lat()) - latitudeRadians(southWest.lat())) / Math.PI,
      );
      const longitudeFraction = Math.max(
        0,
        ((northEast.lng() - southWest.lng() + 360) % 360) / 360,
      );
      const zoomForFraction = (pixels: number, fraction: number) =>
        fraction > 0 ? Math.log2(pixels / 256 / fraction) : 14;
      const fittedZoom = Math.max(
        6,
        Math.min(
          14,
          Math.floor(Math.min(
            zoomForFraction(availableWidth, longitudeFraction),
            zoomForFraction(availableHeight, latitudeFraction),
          )),
        ),
      );
      map.moveCamera({ center: bounds.getCenter(), zoom: fittedZoom });
      return;
    }
    map.fitBounds(bounds, { top: 100, right: 80, bottom: 100, left: 80 });
  }, [filteredPlaces, map]);

  const fitPinsOnMap = useCallback(() => {
    setSelectedId(null);
    setMobilePanelOpen(false);
    fitVisiblePlaces();
  }, [fitVisiblePlaces]);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as string[];
      setFavourites(new Set(stored));
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (!apiKey) {
      setMapError("The map key has not been configured yet.");
      return;
    }

    let active = true;
    const initializeMap = async () => {
      try {
        if (!mapsConfigured) {
          setOptions({
            key: apiKey,
            v: "weekly",
            language: "en",
            region: "AE",
            authReferrerPolicy: "origin",
          });
          mapsConfigured = true;
        }
        const { Map: GoogleMap, RenderingType } = await importLibrary("maps");
        if (!active || !mapElementRef.current) return;
        const instance = new GoogleMap(mapElementRef.current, {
          center: DEFAULT_CENTER,
          zoom: 7,
          minZoom: 6,
          maxZoom: 19,
          renderingType: RenderingType.RASTER,
          styles: DATABASE_ONLY_MAP_STYLES,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          cameraControl: false,
          clickableIcons: false,
          gestureHandling: "greedy",
          draggable: true,
          scrollwheel: true,
          zoomControl: true,
          zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_TOP },
          restriction: { latLngBounds: UAE_BOUNDS, strictBounds: false },
        });
        setMap(instance);
      } catch (error) {
        console.error("Unable to initialize Google Maps", error);
        if (active) setMapError("Google Maps could not load. The place list still works.");
      }
    };

    void initializeMap();
    return () => {
      active = false;
    };
  }, [apiKey]);

  useEffect(() => {
    if (!map) return;
    let cancelled = false;

    const renderMarkers = async () => {
      const { OverlayView } = await importLibrary("maps");
      if (cancelled) return;
      markersRef.current.forEach((marker) => {
        marker.overlay.setMap(null);
      });
      markersRef.current = filteredPlaces.map((place) => {
        const selected = place.id === selectedIdRef.current;
        const node = markerNode(place, selected);
        node.addEventListener("click", () => selectPlace(place.id));
        return {
          ...createMapOverlay(OverlayView, {
            map,
            position: place.coordinates,
            node,
            zIndex: selected ? 1000 : 1,
          }),
          placeId: place.id,
        };
      });
    };

    void renderMarkers();
    return () => {
      cancelled = true;
      markersRef.current.forEach((marker) => marker.overlay.setMap(null));
      markersRef.current = [];
    };
  }, [filteredPlaces, map, selectPlace]);

  useEffect(() => {
    markersRef.current.forEach((marker) => {
      const selected = marker.placeId === selectedId;
      marker.node.classList.toggle(styles.mapMarkerSelected, selected);
      marker.container.style.zIndex = selected ? "1000" : "1";
    });
  }, [selectedId]);

  useEffect(
    () => () => {
      userMarkerRef.current?.overlay.setMap(null);
      userMarkerRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (!map) return;
    if (mobilePanelOpen && window.matchMedia("(max-width: 900px)").matches) return;
    if (!filteredPlaces.length) {
      lastAutoFitSignatureRef.current = null;
      return;
    }
    if (lastAutoFitSignatureRef.current === filterSignature) return;
    if (selectedId) {
      lastAutoFitSignatureRef.current = filterSignature;
      return;
    }
    if (window.matchMedia("(max-width: 900px)").matches) {
      const timer = window.setTimeout(() => {
        lastAutoFitSignatureRef.current = filterSignature;
        fitVisiblePlaces();
      }, 320);
      return () => window.clearTimeout(timer);
    }
    lastAutoFitSignatureRef.current = filterSignature;
    fitVisiblePlaces();
  }, [filterSignature, filteredPlaces.length, fitVisiblePlaces, map, mobilePanelOpen, selectedId]);

  useEffect(() => {
    if (!map || !selectedPlace) return;
    const isMobile = window.matchMedia("(max-width: 900px)").matches;
    if (isMobile) {
      google.maps.event.addListenerOnce(map, "idle", () => {
        map.panBy(0, Math.round(window.innerHeight * 0.27));
      });
    }
    map.moveCamera({
      center: selectedPlace.coordinates,
      zoom: Math.max(map.getZoom() || 7, 12),
    });
  }, [map, selectedPlace]);

  useEffect(() => {
    if (!selectedPlace) {
      setLiveDetails(null);
      setGalleryOpen(false);
      return;
    }

    setActivePhotoIndex(0);
    setGalleryOpen(false);
    setFailedPhotoUrls(new Set());

    let active = true;
    const loadDetails = async () => {
      setDetailsLoading(true);
      setLiveDetails(null);
      try {
        if (!selectedPlace.placeId) {
          setLiveDetails({
            selectionId: selectedPlace.id,
            address: selectedPlace.address,
            mapsUri: selectedPlace.googleMapsSearchUri,
            placeId: null,
            photos: [],
            dataAttributions: [],
          });
          return;
        }
        const { Place } = await importLibrary("places");
        const place = new Place({
          id: selectedPlace.placeId,
          requestedLanguage: "en",
          requestedRegion: "AE",
        });
        await place.fetchFields({ fields: ["formattedAddress", "photos", "googleMapsURI"] });
        const details: LiveDetails = {
          selectionId: selectedPlace.id,
          address: place.formattedAddress || selectedPlace.address,
          mapsUri: place.googleMapsURI || selectedPlace.googleMapsSearchUri,
          placeId: place.id || selectedPlace.placeId,
          photos:
            place.photos?.slice(0, 10).map((photo) => ({
              // Google photo URLs are transient. Keep them in memory only and request
              // the actual image when a visitor advances through the gallery.
              url: photo.getURI({ maxWidth: 1440, maxHeight: 1080 }),
              credits: photo.authorAttributions.map((credit) => ({
                displayName: credit.displayName,
                uri: credit.uri,
              })),
              googleMapsUri: photo.googleMapsURI,
              flagContentUri: photo.flagContentURI,
            })) || [],
          dataAttributions:
            place.attributions?.map((attribution) => ({
              provider: attribution.provider || "data provider",
              uri: attribution.providerURI,
            })) || [],
        };
        if (active) setLiveDetails(details);
      } catch (error) {
        console.warn(`Unable to load live details for ${selectedPlace.name}`, error);
        if (active) {
          setLiveDetails({
            selectionId: selectedPlace.id,
            address: selectedPlace.address,
            mapsUri: selectedPlace.googleMapsSearchUri,
            placeId: selectedPlace.placeId,
            photos: [],
            dataAttributions: [],
          });
        }
      } finally {
        if (active) setDetailsLoading(false);
      }
    };

    void loadDetails();
    return () => {
      active = false;
    };
  }, [selectedPlace]);

  const movePhoto = useCallback(
    (direction: -1 | 1) => {
      if (photos.length < 2) return;
      setActivePhotoIndex((current) => (current + direction + photos.length) % photos.length);
    },
    [photos.length],
  );

  const markPhotoUnavailable = useCallback((url: string) => {
    setFailedPhotoUrls((current) => {
      const next = new Set(current);
      next.add(url);
      return next;
    });
  }, []);

  const handleTouchStart = (event: React.TouchEvent) => {
    touchStartXRef.current = event.changedTouches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (event: React.TouchEvent) => {
    if (touchStartXRef.current === null) return;
    const distance = (event.changedTouches[0]?.clientX ?? touchStartXRef.current) - touchStartXRef.current;
    touchStartXRef.current = null;
    if (Math.abs(distance) < 45) return;
    event.preventDefault();
    suppressGalleryClickRef.current = true;
    window.setTimeout(() => {
      suppressGalleryClickRef.current = false;
    }, 350);
    movePhoto(distance > 0 ? -1 : 1);
  };

  const openGallery = () => {
    if (suppressGalleryClickRef.current) return;
    setGalleryOpen(true);
  };

  useEffect(() => {
    if (!selectedPlace) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      const galleryHasFocus =
        galleryOpen || (target instanceof Node && galleryRegionRef.current?.contains(target));
      if (galleryHasFocus && event.key === "ArrowLeft" && photos.length > 1) {
        event.preventDefault();
        movePhoto(-1);
      } else if (galleryHasFocus && event.key === "ArrowRight" && photos.length > 1) {
        event.preventDefault();
        movePhoto(1);
      } else if (!galleryOpen && event.key === "Escape") {
        event.preventDefault();
        closeSelectedPlace();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closeSelectedPlace, galleryOpen, movePhoto, photos.length, selectedPlace]);

  useEffect(() => {
    if (!selectedPlace || !window.matchMedia("(max-width: 900px)").matches) return;
    window.requestAnimationFrame(() => detailCloseRef.current?.focus());
  }, [selectedPlace]);

  useEffect(() => {
    if (!mobilePanelOpen) return;
    window.requestAnimationFrame(() => mobileMapButtonRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeMobilePanel();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closeMobilePanel, mobilePanelOpen]);

  const toggleFavourite = useCallback((placeId: string) => {
    setFavourites((current) => {
      const next = new Set(current);
      if (next.has(placeId)) next.delete(placeId);
      else next.add(placeId);
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const surpriseMe = () => {
    if (!filteredPlaces.length) return;
    const options = selectedId
      ? filteredPlaces.filter((place) => place.id !== selectedId)
      : filteredPlaces;
    const pool = options.length ? options : filteredPlaces;
    selectPlace(pool[Math.floor(Math.random() * pool.length)].id);
  };

  const locateMe = () => {
    if (!navigator.geolocation) {
      setLocationMessage("Location is not available in this browser.");
      return;
    }
    setLocationMessage("Finding you…");
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const location = { lat: coords.latitude, lng: coords.longitude };
        setUserLocation(location);
        setLocationMessage("Sorted by distance from you");
        if (map) {
          const { OverlayView } = await importLibrary("maps");
          userMarkerRef.current?.overlay.setMap(null);
          const node = document.createElement("div");
          node.className = styles.userMarker;
          node.innerHTML = "<span></span>";
          userMarkerRef.current = createMapOverlay(OverlayView, {
            map,
            position: location,
            node,
            zIndex: 2000,
            centered: true,
            interactive: false,
          });
          map.moveCamera({ center: location, zoom: 11 });
        }
      },
      () => setLocationMessage("Location access was not granted."),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  };

  const clearFilters = () => {
    setQuery("");
    setCategory("all");
    setEmirate("all");
    setFavouritesOnly(false);
  };

  return (
    <main className={styles.shell}>
      <TahoeGlassProvider
        scene={(
          <div
            ref={mapElementRef}
            className={styles.map}
            aria-label="Map of places to go in the UAE"
            aria-hidden={galleryOpen || mobilePanelOpen}
            inert={galleryOpen || mobilePanelOpen}
          />
        )}
        sourceLabel="places-map"
        sceneInteractive
        preferredBackend="auto"
        fallback="blur"
        viewportMode="contained"
        className={styles.explorerSurface}
        contentClassName={styles.explorerSurface}
      >
      <div className={styles.explorerContent} inert={galleryOpen} aria-hidden={galleryOpen}>
        {mapError && (
          <TahoeGlassSurface
            variant="popover"
            radius={14}
            tone="dark"
            semanticTint="light"
            semanticTintOpacity={0.04}
            className={styles.mapError}
            contentClassName="flex items-center gap-2"
            role="status"
          >
            <Compass size={18} />
            <span>{mapError}</span>
          </TahoeGlassSurface>
        )}

        <TahoeGlassSurface
          as="section"
          variant="panel"
          radius={25}
          tone="light"
          semanticTint="dark"
          semanticTintOpacity={0.38}
          id="places-mobile-panel"
          className={`${styles.rail}${mobilePanelOpen ? ` ${styles.railMobileOpen}` : ""}`}
          contentClassName="flex h-full min-h-0 flex-col"
          aria-label="Place finder"
        >
        <div className={styles.mobileSheetHeader}>
          <div className={styles.mobileSheetTitle}>
            <strong>Browse &amp; filter</strong>
            <span>{filteredPlaces.length} {filteredPlaces.length === 1 ? "place" : "places"}</span>
          </div>
          <TahoeGlassSurface
            as="button"
            variant="pill"
            radius={999}
            tone="light"
            semanticTint="light"
            semanticTintOpacity={0.025}
            className={styles.mobileSurpriseButton}
            type="button"
            onClick={surpriseMe}
            disabled={!filteredPlaces.length}
          >
            <Shuffle size={15} /> Surprise
          </TahoeGlassSurface>
          <TahoeGlassSurface
            ref={mobileMapButtonRef}
            as="button"
            variant="pill"
            radius={999}
            tone="dark"
            semanticTint="light"
            semanticTintOpacity={0.025}
            className={styles.mobileMapButton}
            type="button"
            onClick={closeMobilePanel}
            aria-label="Close place browser and return to map"
          >
            <MapIcon size={16} /> Map
          </TahoeGlassSurface>
        </div>
        <header className={styles.header}>
          <div className={styles.brandRow}>
            <Link className={styles.brand} href="/" aria-label="Back to nsso.me">
              <span className={styles.logoWrap}>
                <Image src="/assets/nsso-logo.png" alt="" width={26} height={26} />
              </span>
              <span>nsso field notes</span>
            </Link>
            <TahoeGlassSurface
              as="button"
              variant="pill"
              tone="light"
              semanticTint="light"
              semanticTintOpacity={0.025}
              className={styles.surpriseButton}
              contentClassName="flex items-center gap-2"
              type="button"
              onClick={surpriseMe}
              disabled={!filteredPlaces.length}
            >
              <Shuffle size={15} />
              Surprise us
            </TahoeGlassSurface>
          </div>
          <p className={styles.eyebrow}>UAE date map</p>
          <h1>Where should we go?</h1>
          <p className={styles.intro}>Cafés, coastlines, culture and good excuses to leave the house.</p>
        </header>

        <div className={styles.controls}>
          <TahoeGlassSurface
            variant="recessed"
            radius={13}
            tone="light"
            semanticTint="light"
            semanticTintOpacity={0.025}
            className={styles.searchBox}
            contentClassName="flex h-full w-full items-center gap-2.5"
          >
            <Search size={17} aria-hidden="true" />
            <input
              aria-label="Search places"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search a place, area or mood…"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
                <X size={15} />
                </button>
              )}
          </TahoeGlassSurface>

          <div className={styles.filterRow}>
            <TahoeGlassSurface
              variant="recessed"
              radius={11}
              tone="light"
              semanticTint="light"
              semanticTintOpacity={0.02}
              className={styles.selectWrap}
              contentClassName="flex h-full w-full items-center gap-2"
            >
              <SlidersHorizontal size={15} aria-hidden="true" />
              <select aria-label="Filter by emirate" value={emirate} onChange={(event) => setEmirate(event.target.value)}>
                <option value="all">All Emirates</option>
                {emirates.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </TahoeGlassSurface>
            <TahoeGlassSurface
              as="button"
              variant="pill"
              tone="light"
              semanticTint={favouritesOnly ? "light" : "none"}
              semanticTintOpacity={0.035}
              className={`${styles.favouriteFilter}${favouritesOnly ? ` ${styles.favouriteFilterActive}` : ""}`}
              type="button"
              onClick={() => setFavouritesOnly((value) => !value)}
              aria-pressed={favouritesOnly}
            >
              <Heart size={15} fill={favouritesOnly ? "currentColor" : "none"} />
              Saved {favourites.size ? `(${favourites.size})` : ""}
            </TahoeGlassSurface>
            <TahoeGlassSurface
              as="button"
              variant="pill"
              tone="light"
              className={styles.locateButton}
              type="button"
              onClick={locateMe}
              aria-label="Sort places near me"
            >
              <LocateFixed size={16} />
            </TahoeGlassSurface>
          </div>
          {locationMessage && <p className={styles.locationMessage}>{locationMessage}</p>}

          <TahoeGlassSurface
            variant="recessed"
            radius={11}
            tone="light"
            semanticTint="light"
            semanticTintOpacity={0.02}
            className={styles.mobileCategorySelect}
            contentClassName="flex h-full w-full items-center gap-2"
          >
            <SlidersHorizontal size={15} aria-hidden="true" />
            <select
              aria-label="Filter by category"
              value={category}
              onChange={(event) => setCategory(event.target.value as PlaceCategory | "all")}
            >
              <option value="all">All categories ({places.length})</option>
              {visibleCategories.map(([key, meta]) => (
                <option key={key} value={key}>{meta.label} ({categoryCounts.get(key)})</option>
              ))}
            </select>
          </TahoeGlassSurface>

          <div className={styles.categoryScroller} aria-label="Filter by category">
            <TahoeGlassSurface
              as="button"
              variant="pill"
              tone="light"
              semanticTint={category === "all" ? "light" : "none"}
              semanticTintOpacity={0.035}
              type="button"
              className={`${styles.categoryPill}${category === "all" ? ` ${styles.categoryPillActive}` : ""}`}
              onClick={() => setCategory("all")}
              aria-pressed={category === "all"}
            >
              All <span>{places.length}</span>
            </TahoeGlassSurface>
            {visibleCategories.map(([key, meta]) => (
              <TahoeGlassSurface
                as="button"
                variant="pill"
                tone="light"
                semanticTint={category === key ? "light" : "none"}
                semanticTintOpacity={0.035}
                key={key}
                type="button"
                className={`${styles.categoryPill}${category === key ? ` ${styles.categoryPillActive}` : ""}`}
                onClick={() => setCategory(key)}
                aria-pressed={category === key}
                style={{ "--pill-color": meta.color } as React.CSSProperties}
              >
                <i /> {meta.shortLabel} <span>{categoryCounts.get(key)}</span>
              </TahoeGlassSurface>
            ))}
          </div>
        </div>

        <div className={styles.listHeader}>
          <span>{filteredPlaces.length} {filteredPlaces.length === 1 ? "place" : "places"}</span>
          {userLocation ? <span>nearest first</span> : <span>across the UAE</span>}
        </div>

        <div className={styles.placeList}>
          {filteredPlaces.map((place) => {
            const meta = categoryFor(place);
            const isFavourite = favourites.has(place.id);
            const distance = userLocation ? haversineKm(userLocation, place.coordinates) : null;
            return (
              <TahoeGlassSurface
                as="article"
                variant="card"
                radius={15}
                tone="light"
                semanticTint="dark"
                semanticTintOpacity={selectedId === place.id ? 0.42 : 0.38}
                key={place.id}
                className={`${styles.placeCard}${selectedId === place.id ? ` ${styles.placeCardSelected}` : ""}`}
                contentClassName="relative flex min-h-[78px] w-full"
                style={{ "--category-color": meta.color } as React.CSSProperties}
              >
                <button className={styles.placeMain} type="button" onClick={() => selectPlace(place.id)}>
                  <span className={styles.placeIndex}><i /></span>
                  <span className={styles.placeCopy}>
                    <span className={styles.placeMeta}>
                      <span>{meta.label}</span>
                      <span>·</span>
                      <span>{place.emirate}</span>
                    </span>
                    <strong>{place.name}</strong>
                    <span className={styles.placeAddress}>{place.address}</span>
                  </span>
                  {distance !== null && <span className={styles.distance}>{Math.round(distance)} km</span>}
                </button>
                <TahoeGlassSurface
                  as="button"
                  variant="pill"
                  radius={9}
                  tone="light"
                  semanticTint={isFavourite ? "light" : "none"}
                  semanticTintOpacity={0.035}
                  className={`${styles.heartButton}${isFavourite ? ` ${styles.heartButtonActive}` : ""}`}
                  type="button"
                  onClick={() => toggleFavourite(place.id)}
                  aria-label={isFavourite ? `Remove ${place.name} from saved places` : `Save ${place.name}`}
                >
                  <Heart size={16} fill={isFavourite ? "currentColor" : "none"} />
                </TahoeGlassSurface>
              </TahoeGlassSurface>
            );
          })}

          {!filteredPlaces.length && (
            <div className={styles.emptyState}>
              <Sparkles size={24} />
              <strong>No places match that combination.</strong>
              <button type="button" onClick={clearFilters}>Clear the filters</button>
            </div>
          )}
          <footer className={styles.attribution}>
            <span>Built from {payload.meta.sourceRecordCount} saved UAE ideas.</span>
            <a
              href={payload.meta.geocoder === "google-places-new" ? "https://maps.google.com" : "https://www.openstreetmap.org/copyright"}
              target="_blank"
              rel="noreferrer"
            >
              {payload.meta.geocoder === "google-places-new" ? "Google Maps" : "© OpenStreetMap"}
            </a>
          </footer>
        </div>
        </TahoeGlassSurface>

        {!selectedPlace && !mobilePanelOpen && (
          <>
          {locationMessage && (
            <div className={styles.mobileLocationStatus} role="status" aria-live="polite">
              {locationMessage}
            </div>
          )}
          <nav className={styles.mobileDock} aria-label="Map explorer controls">
            <TahoeGlassSurface
              ref={mobileBrowseButtonRef}
              as="button"
              variant="button"
              radius={16}
              tone="light"
              semanticTint="dark"
              semanticTintOpacity={0.08}
              className={styles.mobileBrowseButton}
              type="button"
              onClick={openMobilePanel}
              aria-expanded={mobilePanelOpen}
              aria-controls="places-mobile-panel"
            >
              <Search size={18} />
              <span>Browse</span>
              <em>{filteredPlaces.length}</em>
              {activeFilterCount > 0 && <i>{activeFilterCount} active</i>}
            </TahoeGlassSurface>
            <TahoeGlassSurface
              as="button"
              variant="button"
              radius={16}
              tone="light"
              semanticTint="dark"
              semanticTintOpacity={0.08}
              className={styles.mobileFitButton}
              type="button"
              onClick={fitPinsOnMap}
              aria-label="Fit all filtered places on the map"
            >
              <MapIcon size={18} />
              <span>Fit pins</span>
            </TahoeGlassSurface>
            <TahoeGlassSurface
              as="button"
              variant="button"
              radius={16}
              tone="dark"
              semanticTint="dark"
              semanticTintOpacity={0.08}
              className={styles.mobileLocateButton}
              type="button"
              onClick={locateMe}
              aria-label="Find places near me"
            >
              <LocateFixed size={18} />
              <span>Near me</span>
            </TahoeGlassSurface>
          </nav>
          </>
        )}

        {selectedPlace && (
          <TahoeGlassSurface
            as="aside"
            variant="panel"
            radius={24}
            tone="dark"
            semanticTint="light"
            semanticTintOpacity={0.035}
            className={styles.detailCard}
            contentClassName={`${styles.detailContent} relative`}
            aria-label={`Details for ${selectedPlace.name}`}
          >
          <div className={styles.detailControls} role="group" aria-label="Place actions">
            <TahoeGlassSurface
              as="button"
              variant="pill"
              radius={999}
              className={`${styles.detailSave}${favourites.has(selectedPlace.id) ? ` ${styles.detailSaveActive}` : ""}`}
              contentClassName={styles.detailControlContent}
              tone="light"
              semanticTint={favourites.has(selectedPlace.id) ? "dark" : "none"}
              semanticTintOpacity={0.06}
              type="button"
              onClick={() => toggleFavourite(selectedPlace.id)}
              aria-label={favourites.has(selectedPlace.id) ? "Remove from saved places" : "Save this place"}
              aria-pressed={favourites.has(selectedPlace.id)}
              title={favourites.has(selectedPlace.id) ? "Remove from saved places" : "Save this place"}
            >
              <Heart size={16} fill={favourites.has(selectedPlace.id) ? "currentColor" : "none"} />
              <span>{favourites.has(selectedPlace.id) ? "Saved" : "Save"}</span>
            </TahoeGlassSurface>
            <TahoeGlassSurface
              ref={detailCloseRef}
              as="button"
              variant="button"
              radius={20}
              className={styles.closeButton}
              contentClassName={styles.detailControlContent}
              tone="light"
              semanticTint="dark"
              semanticTintOpacity={0.035}
              type="button"
              onClick={closeSelectedPlace}
              aria-label="Close place details"
              title="Close details"
            >
              <X size={18} />
            </TahoeGlassSurface>
          </div>

          <div
            ref={galleryRegionRef}
            className={`${styles.detailHero}${!activePhoto || activePhotoUnavailable ? ` ${styles.detailHeroFallback}` : ""}`}
            style={{ "--detail-color": categoryFor(selectedPlace).color } as React.CSSProperties}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <TahoeGlassProvider
              scene={activePhotoSceneUrl && !activePhotoUnavailable ? (
                <img
                  className={styles.photoScene}
                  src={activePhotoSceneUrl}
                  alt=""
                  onError={() => activePhoto && markPhotoUnavailable(activePhoto.url)}
                />
              ) : (
                <div className={styles.photoSceneFallback} />
              )}
              sourceLabel={activePhotoSceneUrl ? "place-photo" : "place-photo-fallback"}
              webglSource={activePhotoUnavailable ? undefined : activePhotoWebglSource}
              preferredBackend="auto"
              fallback="blur"
              viewportMode="contained"
              className="absolute inset-0"
              contentClassName="h-full"
            >
            {activePhoto && !activePhotoUnavailable ? (
              <button
                ref={galleryTriggerRef}
                className={styles.heroImageButton}
                type="button"
                onClick={openGallery}
                aria-label={`Open full-screen photo ${activePhotoIndex + 1} of ${photos.length} for ${selectedPlace.name}`}
              >
                <span className={styles.srOnly}>{selectedPlace.name}, photo {activePhotoIndex + 1} of {photos.length}</span>
                <TahoeGlassSurface
                  variant="pill"
                  tone="light"
                  semanticTint="dark"
                  semanticTintOpacity={0.03}
                  className={styles.expandHint}
                  contentClassName="flex items-center gap-1.5"
                >
                  <Maximize2 size={13} /> Expand
                </TahoeGlassSurface>
              </button>
            ) : (
              <div className={styles.fallbackArt} aria-hidden="true">
                <span /><span /><span />
                {detailsLoading ? (
                  <em>Finding photos…</em>
                ) : activePhotoUnavailable ? (
                  <em>Photo unavailable</em>
                ) : (
                  <em>{categoryFor(selectedPlace).shortLabel}</em>
                )}
              </div>
            )}
            {photos.length ? (
              <TahoeGlassSurface
                variant="pill"
                tone="light"
                semanticTint="dark"
                semanticTintOpacity={0.03}
                className={styles.galleryCount}
                contentClassName="flex items-center gap-1.5"
                aria-live="polite"
              >
                <Images size={13} /> {activePhotoIndex + 1} / {photos.length}
              </TahoeGlassSurface>
            ) : null}
            {photos.length > 1 ? (
              <>
                <TahoeGlassButton
                  className={`${styles.galleryArrow} ${styles.galleryArrowPrevious}`}
                  contentClassName="text-white"
                  tone="light"
                  semanticTint="dark"
                  semanticTintOpacity={0.03}
                  type="button"
                  onClick={() => movePhoto(-1)}
                  aria-label={`Previous photo of ${selectedPlace.name}`}
                >
                  <ChevronLeft size={20} />
                </TahoeGlassButton>
                <TahoeGlassButton
                  className={`${styles.galleryArrow} ${styles.galleryArrowNext}`}
                  contentClassName="text-white"
                  tone="light"
                  semanticTint="dark"
                  semanticTintOpacity={0.03}
                  type="button"
                  onClick={() => movePhoto(1)}
                  aria-label={`Next photo of ${selectedPlace.name}`}
                >
                  <ChevronRight size={20} />
                </TahoeGlassButton>
              </>
            ) : null}
            {activePhoto && !activePhotoUnavailable ? (
              <TahoeGlassSurface
                variant="popover"
                radius={10}
                tone="light"
                semanticTint="dark"
                semanticTintOpacity={0.035}
                className={`${styles.photoCredit} px-2 py-1.5`}
              >
                {activePhoto.credits.length ? (
                  <>
                    Photo by{" "}
                    {activePhoto.credits.map((credit, index) => (
                      <span key={`${credit.displayName}-${index}`}>
                        {index > 0 ? ", " : ""}
                        {credit.uri ? <a href={credit.uri} target="_blank" rel="noreferrer">{credit.displayName}</a> : credit.displayName}
                      </span>
                    ))}
                    {" · "}
                  </>
                ) : null}
                <a href={activePhoto.googleMapsUri || currentDetails?.mapsUri || selectedPlace.googleMapsSearchUri} target="_blank" rel="noreferrer">Google Maps photo</a>
              </TahoeGlassSurface>
            ) : null}
            </TahoeGlassProvider>
          </div>

          {photos.length > 1 ? (
            <div className={styles.galleryPager} aria-label={`${photos.length} photos of ${selectedPlace.name}`}>
              {photos.map((photo, index) => (
                <button
                  key={`${photo.url}-${index}`}
                  className={index === activePhotoIndex ? styles.galleryPagerActive : undefined}
                  type="button"
                  onClick={() => setActivePhotoIndex(index)}
                  aria-label={`Show photo ${index + 1} of ${photos.length}`}
                  aria-pressed={index === activePhotoIndex}
                />
              ))}
            </div>
          ) : null}

          <div className={styles.detailBody}>
            <div className={styles.detailMeta}>
              <span style={{ "--detail-color": categoryFor(selectedPlace).color } as React.CSSProperties}>
                <i /> {categoryFor(selectedPlace).label}
              </span>
              <span>{selectedPlace.emirate}</span>
            </div>
            <h2>{selectedPlace.name}</h2>
            <p className={styles.detailAddress}>
              <MapPin size={15} />
              <span>{currentDetails?.address || selectedPlace.address}</span>
            </p>
            <p className={styles.detailDescription}>{selectedPlace.description || "A saved place to explore together."}</p>
            <div className={styles.detailActions}>
              <TahoeGlassSurface
                as="a"
                variant="button"
                radius={12}
                tone="light"
                semanticTint="dark"
                semanticTintOpacity={0.055}
                contentClassName="flex items-center justify-center gap-2 text-white"
                href={directionsUrl(selectedPlace, currentDetails?.placeId || selectedPlace.placeId)}
                target="_blank"
                rel="noreferrer"
              >
                <ArrowUpRight size={17} /> Get directions
              </TahoeGlassSurface>
              <TahoeGlassSurface
                as="a"
                variant="button"
                radius={12}
                tone="dark"
                semanticTint="light"
                semanticTintOpacity={0.025}
                contentClassName="flex items-center justify-center gap-2"
                href={currentDetails?.mapsUri || selectedPlace.googleMapsSearchUri}
                target="_blank"
                rel="noreferrer"
              >
                Google Maps <ExternalLink size={14} />
              </TahoeGlassSurface>
            </div>
            {selectedPlace.sourceUrls[0] && (
              <a className={styles.sourceLink} href={selectedPlace.sourceUrls[0]} target="_blank" rel="noreferrer">
                Visit the original place link <ExternalLink size={13} />
              </a>
            )}
            {currentDetails?.dataAttributions.length ? (
              <p className={styles.dataAttribution}>
                Place data by{" "}
                {currentDetails.dataAttributions.map((attribution, index) => (
                  <span key={`${attribution.provider}-${index}`}>
                    {index > 0 ? ", " : ""}
                    {attribution.uri ? (
                      <a href={attribution.uri} target="_blank" rel="noreferrer">{attribution.provider}</a>
                    ) : attribution.provider}
                  </span>
                ))}
              </p>
            ) : null}
          </div>
          </TahoeGlassSurface>
        )}
      </div>

      {galleryOpen && selectedPlace && activePhoto && (
        <TahoeGlassProvider
          scene={(
            <img
              className={styles.lightboxScene}
              src={activePhotoSceneUrl || proxiedPlacePhoto(activePhoto.url)}
              alt=""
              onError={() => markPhotoUnavailable(activePhoto.url)}
            />
          )}
          sourceLabel="place-photo"
          webglSource={activePhotoWebglSource}
          preferredBackend="auto"
          fallback="blur"
          viewportMode="contained"
          className={`${styles.lightbox} pointer-events-auto`}
          contentClassName="h-full w-full"
        >
        <div
          ref={lightboxRef}
          className={styles.lightboxLayout}
          role="dialog"
          aria-modal="true"
          aria-label={`Photo gallery for ${selectedPlace.name}`}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <button
            className={styles.lightboxBackdrop}
            type="button"
            tabIndex={-1}
            onClick={() => {
              if (!suppressGalleryClickRef.current) setGalleryOpen(false);
            }}
            aria-label="Close full-screen gallery"
          />
          <TahoeGlassSurface
            as="header"
            variant="menu"
            radius="0 0 24px 24px"
            tone="light"
            semanticTint="dark"
            semanticTintOpacity={0.03}
            className={styles.lightboxHeader}
            contentClassName="grid h-full grid-cols-[minmax(0,1fr)_auto_48px] items-center gap-5"
          >
            <div>
              <span>{selectedPlace.emirate}</span>
              <strong>{selectedPlace.name}</strong>
            </div>
            <span className={styles.lightboxCount} aria-live="polite" aria-atomic="true">
              {activePhotoIndex + 1} of {photos.length}
            </span>
            <TahoeGlassButton
              ref={lightboxCloseRef}
              className={styles.lightboxClose}
              contentClassName="text-white"
              tone="light"
              semanticTint="dark"
              semanticTintOpacity={0.025}
              type="button"
              onClick={() => setGalleryOpen(false)}
              aria-label="Close full-screen gallery"
            >
              <X size={22} />
            </TahoeGlassButton>
          </TahoeGlassSurface>

          <div className={styles.lightboxStage}>
            {activePhoto && !activePhotoUnavailable ? (
              <img
                key={activePhoto.url}
                src={activePhotoSceneUrl || proxiedPlacePhoto(activePhoto.url)}
                alt={`${selectedPlace.name}, photo ${activePhotoIndex + 1} of ${photos.length}`}
                onError={() => markPhotoUnavailable(activePhoto.url)}
              />
            ) : (
              <div className={styles.lightboxFallback}>
                <Images size={34} />
                <span>This photo is unavailable.</span>
              </div>
            )}
            {photos.length > 1 ? (
              <>
                <TahoeGlassButton
                  className={`${styles.lightboxArrow} ${styles.lightboxArrowPrevious}`}
                  contentClassName="text-white"
                  tone="light"
                  semanticTint="dark"
                  semanticTintOpacity={0.025}
                  type="button"
                  onClick={() => movePhoto(-1)}
                  aria-label={`Previous photo of ${selectedPlace.name}`}
                >
                  <ChevronLeft size={30} />
                </TahoeGlassButton>
                <TahoeGlassButton
                  className={`${styles.lightboxArrow} ${styles.lightboxArrowNext}`}
                  contentClassName="text-white"
                  tone="light"
                  semanticTint="dark"
                  semanticTintOpacity={0.025}
                  type="button"
                  onClick={() => movePhoto(1)}
                  aria-label={`Next photo of ${selectedPlace.name}`}
                >
                  <ChevronRight size={30} />
                </TahoeGlassButton>
              </>
            ) : null}
          </div>

          <TahoeGlassSurface
            as="footer"
            variant="menu"
            radius="24px 24px 0 0"
            tone="light"
            semanticTint="dark"
            semanticTintOpacity={0.03}
            className={styles.lightboxFooter}
            contentClassName={styles.lightboxFooterContent}
          >
            <div className={styles.lightboxCredit}>
              {activePhoto && !activePhotoUnavailable ? (
                <>
                  {activePhoto.credits.length ? (
                    <>
                      Photo by{" "}
                      {activePhoto.credits.map((credit, index) => (
                        <span key={`${credit.displayName}-${index}`}>
                          {index > 0 ? ", " : ""}
                          {credit.uri ? <a href={credit.uri} target="_blank" rel="noreferrer">{credit.displayName}</a> : credit.displayName}
                        </span>
                      ))}
                      {" · "}
                    </>
                  ) : null}
                  <a href={activePhoto.googleMapsUri || currentDetails?.mapsUri || selectedPlace.googleMapsSearchUri} target="_blank" rel="noreferrer">Google Maps photo</a>
                  {activePhoto.flagContentUri ? (
                    <>{" · "}<a href={activePhoto.flagContentUri} target="_blank" rel="noreferrer">Report photo</a></>
                  ) : null}
                  {currentDetails?.dataAttributions.map((attribution, index) => (
                    <span key={`${attribution.provider}-${index}`}>
                      {" · Data by "}
                      {attribution.uri ? (
                        <a href={attribution.uri} target="_blank" rel="noreferrer">{attribution.provider}</a>
                      ) : attribution.provider}
                    </span>
                  ))}
                </>
              ) : (
                <a href={currentDetails?.mapsUri || selectedPlace.googleMapsSearchUri} target="_blank" rel="noreferrer">View on Google Maps</a>
              )}
            </div>
            {photos.length > 1 ? (
              <div className={styles.lightboxPager} aria-label={`${photos.length} photos of ${selectedPlace.name}`}>
                {photos.map((photo, index) => (
                  <button
                    key={`${photo.url}-${index}`}
                    className={index === activePhotoIndex ? styles.lightboxPagerActive : undefined}
                    type="button"
                    onClick={() => setActivePhotoIndex(index)}
                    aria-label={`Show photo ${index + 1} of ${photos.length}`}
                    aria-pressed={index === activePhotoIndex}
                  />
                ))}
              </div>
            ) : null}
            <span className={styles.lightboxHint}>Swipe or use arrow keys</span>
          </TahoeGlassSurface>
        </div>
        </TahoeGlassProvider>
      )}
      <ToastViewport />
      </TahoeGlassProvider>
    </main>
  );
}
