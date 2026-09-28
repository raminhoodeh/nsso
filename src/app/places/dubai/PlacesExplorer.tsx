"use client";
/* eslint-disable @next/next/no-img-element -- Google Places photo URLs are transient. */

import {
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Compass,
  ExternalLink,
  Heart,
  Images,
  Map as MapIcon,
  LocateFixed,
  MapPin,
  Maximize2,
  PanelLeft,
  Sparkles,
  X,
} from "lucide-react";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DubaiEvent, DubaiPlace, PlaceCategory, PlacesPayload } from "@/data/places-dubai";
import { activeEventsFor, googleCalendarUrl } from "@/lib/places-events";
import { agendaEntries, type AgendaWindow } from "@/lib/places-agenda";
import { datePlans, editorialResearchedAt } from "@/lib/places-editorial";
import { placeClosureNotice, surpriseCandidates } from "@/lib/places-business-status";
import { EXPERIENCES, matchesExperience, type ExperienceId } from "@/lib/places-experiences";
import {
  TahoeGlassButton,
  TahoeGlassProvider,
  TahoeGlassSurface,
  useTahoeModalAccessibility,
  type TahoeGlassWebGLSource,
} from "@/components/ui/tahoe-glass";
import { ToastViewport } from "@/components/ui/Toast";
import styles from "./places.module.css";
import PlacesNavigation from "./PlacesNavigation";
import EventsAgenda from "./EventsAgenda";
import PlaceVisitGuide from "./PlaceVisitGuide";
import PlacesDeity from "./PlacesDeity";

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
  "art-exhibitions": { label: "Art Exhibitions", shortLabel: "Exhibitions", color: "#9b548b" },
  "shows-immersive": { label: "Shows & immersive", shortLabel: "Shows", color: "#b85270" },
  "creative-workshop": { label: "Creative workshops", shortLabel: "Make", color: "#b97a36" },
  wellness: { label: "Wellness", shortLabel: "Reset", color: "#668078" },
  "resort-beach-club": { label: "Resorts & beach clubs", shortLabel: "Stay", color: "#456080" },
  "sport-active": { label: "Sport & active", shortLabel: "Move", color: "#c45d3c" },
  "shopping-stroll": { label: "Strolls & shopping", shortLabel: "Stroll", color: "#9a7048" },
  "family-animals": { label: "Animals & family", shortLabel: "Play", color: "#58877a" },
  "events-activities": { label: "Events & activities", shortLabel: "Events", color: "#d28a35" },
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

function markerNode(place: DubaiPlace, selected: boolean, activeEventCount: number) {
  const node = document.createElement("button");
  const category = categoryFor(place);
  const hasEvents = activeEventCount > 0;
  node.type = "button";
  node.tabIndex = window.matchMedia("(max-width: 900px)").matches ? -1 : 0;
  node.className = `${styles.mapMarker}${hasEvents ? ` ${styles.mapMarkerEvent}` : ""}${selected ? ` ${styles.mapMarkerSelected}` : ""}`;
  node.style.setProperty("--marker-color", category.color);
  node.setAttribute(
    "aria-label",
    hasEvents
      ? `Open ${place.name}, ${activeEventCount} current or upcoming ${activeEventCount === 1 ? "event" : "events"}`
      : `Open ${place.name}`,
  );
  node.title = place.name;
  node.innerHTML = `<span></span>${hasEvents ? '<i aria-hidden="true"></i>' : ""}`;
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
  const detailCloseRef = useRef<HTMLElement>(null);
  const detailPanelRef = useRef<HTMLElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [experienceId, setExperienceId] = useState<ExperienceId | null>(null);
  const [subcategoryId, setSubcategoryId] = useState<string | null>(null);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [agendaWindow, setAgendaWindow] = useState<AgendaWindow>("all");
  const [datePlanId, setDatePlanId] = useState<string | null>(null);
  const selectedDatePlan = datePlans.find(plan => plan.id === datePlanId) || null;
  const [isCompact, setIsCompact] = useState(false);
  const category = subcategoryId === "art-exhibitions" ? "art-exhibitions" : "all";
  const [emirate, setEmirate] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const [favourites, setFavourites] = useState<Set<string>>(new Set());
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  const [clientNow, setClientNow] = useState<number | null>(() => {
    const generatedAt = Date.parse(payload.meta.generatedAt);
    return Number.isFinite(generatedAt) ? generatedAt : null;
  });
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [liveDetails, setLiveDetails] = useState<LiveDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [failedPhotoUrls, setFailedPhotoUrls] = useState<Set<string>>(new Set());
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [navigationMinimized, setNavigationMinimized] = useState(false);
  const [deityOpen, setDeityOpen] = useState(false);

  useEffect(() => {
    try { setNavigationMinimized(localStorage.getItem("nsso-places-menu-minimized") === "true"); } catch { /* Storage is optional. */ }
  }, []);
  const changeNavigationMinimized = (value: boolean) => {
    setNavigationMinimized(value);
    try { localStorage.setItem("nsso-places-menu-minimized", String(value)); } catch { /* Keep the in-memory preference. */ }
  };
  const changeDeityOpen = useCallback((value: boolean) => {
    setDeityOpen(value);
    if (value) setMobilePanelOpen(false);
  }, []);

  useEffect(() => {
    if (!map) return;
    const frame = window.requestAnimationFrame(() => {
      const center = map.getCenter();
      google.maps.event.trigger(map, "resize");
      if (center) map.setCenter(center);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [map, navigationMinimized, isCompact]);

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
  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const syncViewport = () => {
      setIsCompact(media.matches);
      if (!media.matches) setMobilePanelOpen(false);
      markersRef.current.forEach(marker => { marker.node.tabIndex = media.matches ? -1 : 0; });
    };
    syncViewport();
    media.addEventListener("change", syncViewport);
    return () => media.removeEventListener("change", syncViewport);
  }, []);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("category") === "art-exhibitions") {
      setExperienceId("whats-on");
      setSubcategoryId("art-exhibitions");
      setResultsOpen(true);
      if (window.matchMedia("(max-width: 900px)").matches) setMobilePanelOpen(true);
    }
  }, []);
  const activeEventsByPlace = useMemo(() => {
    const activeEvents = new Map<string, DubaiEvent[]>();
    places.forEach((place) => activeEvents.set(place.id, activeEventsFor(place, clientNow)));
    return activeEvents;
  }, [clientNow, places]);
  const windowedEventsByPlace = useMemo(() => {
    const events = new Map<string, DubaiEvent[]>();
    agendaEntries(places, clientNow, null, agendaWindow).forEach(({ place, event }) => {
      events.set(place.id, [...(events.get(place.id) || []), event]);
    });
    return events;
  }, [places, clientNow, agendaWindow]);
  const availablePlaces = useMemo(
    () => places.filter(
      (place) => place.listingType !== "event-venue" || (activeEventsByPlace.get(place.id)?.length || 0) > 0,
    ),
    [activeEventsByPlace, places],
  );
  const activeEventCount = useMemo(
    () => [...activeEventsByPlace.values()].reduce((total, events) => total + events.length, 0),
    [activeEventsByPlace],
  );
  const selectedPlace = selectedId
    ? availablePlaces.find((place) => place.id === selectedId) || null
    : null;
  const selectedClosure = selectedPlace ? placeClosureNotice(selectedPlace) : null;
  const selectedEvents = selectedPlace ? activeEventsByPlace.get(selectedPlace.id) || [] : [];
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
    () => [...new Set(availablePlaces.map((place) => place.emirate))].sort(),
    [availablePlaces],
  );

  const navigationCounts = useMemo(() => {
    const inArea = availablePlaces.filter(place => emirate === "all" || place.emirate === emirate);
    const groups: Record<string, number> = {};
    const subcategories: Record<string, number> = {};
    EXPERIENCES.forEach(experience => {
      const eventsForNavigation = experience.id === "whats-on" ? windowedEventsByPlace : activeEventsByPlace;
      const groupPlaces = inArea.filter(place => matchesExperience(place, eventsForNavigation.get(place.id) || [], experience.id));
      groups[experience.id] = groupPlaces.length;
      experience.subcategories.forEach(subcategory => {
        subcategories[subcategory.id] = groupPlaces.filter(place => matchesExperience(place, eventsForNavigation.get(place.id) || [], experience.id, subcategory.id)).length;
      });
    });
    return { groups, subcategories };
  }, [activeEventsByPlace, windowedEventsByPlace, availablePlaces, emirate]);

  const filteredPlaces = useMemo(() => {
    const next = availablePlaces.filter((place) => {
      const events = (experienceId === "whats-on" ? windowedEventsByPlace : activeEventsByPlace).get(place.id) || [];
      if (experienceId && !matchesExperience(place, events, experienceId, subcategoryId)) return false;
      if (selectedDatePlan && !selectedDatePlan.placeIds.includes(place.id)) return false;
      if (emirate !== "all" && place.emirate !== emirate) return false;
      if (favouritesOnly && !favourites.has(place.id)) return false;
      return true;
    });

    if (selectedDatePlan) return [...next].sort((a, b) => selectedDatePlan.placeIds.indexOf(a.id) - selectedDatePlan.placeIds.indexOf(b.id));
    if (userLocation) {
      return [...next].sort(
        (a, b) => haversineKm(userLocation, a.coordinates) - haversineKm(userLocation, b.coordinates),
      );
    }
    return next;
  }, [activeEventsByPlace, windowedEventsByPlace, availablePlaces, experienceId, subcategoryId, selectedDatePlan, emirate, favourites, favouritesOnly, userLocation]);

  const openMobilePanel = useCallback(() => {
    setDeityOpen(false);
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
    setDeityOpen(false);
    setMobilePanelOpen(false);
    setSelectedId(placeId);
  }, []);

  const filterSignature = useMemo(
    () => filteredPlaces.map((place) => place.id).sort().join("|"),
    [filteredPlaces],
  );
  const filteredAgenda = useMemo(
    () => agendaEntries(filteredPlaces, clientNow, subcategoryId, agendaWindow),
    [filteredPlaces, clientNow, subcategoryId, agendaWindow],
  );
  const resultLabel = experienceId === "whats-on"
    ? `${filteredAgenda.length} ${category === "art-exhibitions" ? filteredAgenda.length === 1 ? "exhibition" : "exhibitions" : filteredAgenda.length === 1 ? "event" : "events"}`
    : `${filteredPlaces.length} ${filteredPlaces.length === 1 ? "place" : "places"}`;

  const fitVisiblePlaces = useCallback(() => {
    if (!map || !filteredPlaces.length) return;
    if (filteredPlaces.length === 1) {
      map.moveCamera({ center: filteredPlaces[0].coordinates, zoom: 14 });
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    filteredPlaces.forEach((place) => bounds.extend(place.coordinates));
    const isMobile = window.matchMedia("(max-width: 900px)").matches;
    {
      const northEast = bounds.getNorthEast();
      const southWest = bounds.getSouthWest();
      const mapRect = map.getDiv().getBoundingClientRect();
      // The sidebar owns its layout space; the map starts to its right.
      const leftPadding = isMobile ? 42 : 48;
      const rightPadding = isMobile ? 42 : 48;
      const availableWidth = Math.max(1, mapRect.width - leftPadding - rightPadding);
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
      // Set centre and zoom atomically. Initial raster fitBounds animation can
      // retain the old UAE centre while applying the tighter exhibition zoom.
      const center = bounds.getCenter();
      const longitudeOffset = ((leftPadding - rightPadding) / 2) * 360 / (256 * 2 ** fittedZoom);
      map.moveCamera({ center: { lat: center.lat(), lng: center.lng() - longitudeOffset }, zoom: fittedZoom });
      return;
    }
  }, [filteredPlaces, map]);

  const fitPinsOnMap = useCallback(() => {
    setSelectedId(null);
    setMobilePanelOpen(false);
    fitVisiblePlaces();
  }, [fitVisiblePlaces]);

  useEffect(() => {
    const updateClock = () => setClientNow(Date.now());
    updateClock();
    const clock = window.setInterval(updateClock, 60_000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    if (selectedId && !selectedPlace) setSelectedId(null);
  }, [selectedId, selectedPlace]);

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
        const eventCount = experienceId === "whats-on" ? filteredAgenda.filter(entry => entry.place.id === place.id).length : activeEventsByPlace.get(place.id)?.length || 0;
        const node = markerNode(place, selected, eventCount);
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
  }, [activeEventsByPlace, filteredAgenda, experienceId, filteredPlaces, map, selectPlace]);

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
    const zoom = Math.max(map.getZoom() || 7, 12);
    const center = { ...selectedPlace.coordinates };
    if (isMobile) {
      google.maps.event.addListenerOnce(map, "idle", () => {
        map.panBy(0, Math.round(window.innerHeight * 0.27));
      });
    } else {
      // Keep the pin in the exposed map area, to the left of the detail card.
      const detailWidth = detailPanelRef.current?.getBoundingClientRect().width || 405;
      center.lng += ((detailWidth + 40) / 2) * 360 / (256 * 2 ** zoom);
    }
    map.moveCamera({ center, zoom });
  }, [map, selectedPlace, isCompact]);

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
    if (!selectedPlace || deityOpen) return;
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
  }, [closeSelectedPlace, deityOpen, galleryOpen, movePhoto, photos.length, selectedPlace]);

  useEffect(() => {
    if (!selectedPlace || deityOpen || !window.matchMedia("(max-width: 900px)").matches) return;
    const frame = window.requestAnimationFrame(() => detailCloseRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [selectedPlace, deityOpen]);

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
    const pool = surpriseCandidates(filteredPlaces, selectedId);
    if (!pool.length) {
      setLocationMessage("The places in this selection are reported closed or awaiting seasonal confirmation. Try another collection, or confirm with the venues before travelling.");
      return;
    }
    setLocationMessage(null);
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
    setDatePlanId(null);
    setAgendaWindow("all");
    setExperienceId(null);
    setSubcategoryId(null);
    setResultsOpen(false);
    setEmirate("all");
    setFavouritesOnly(false);
    setSelectedId(null);
  };

  const chooseExperience = (id: ExperienceId) => {
    setDatePlanId(null);
    setAgendaWindow("all");
    setExperienceId(id);
    setSubcategoryId(null);
    setResultsOpen(false);
    setFavouritesOnly(false);
    setSelectedId(null);
  };

  const chooseSubcategory = (id: string | null) => {
    setSubcategoryId(id);
    setSelectedId(null);
    if (isCompact) closeMobilePanel();
  };

  const navigateBack = () => {
    setSelectedId(null);
    if (resultsOpen && !favouritesOnly && !selectedDatePlan) setResultsOpen(false);
    else {
      setDatePlanId(null);
      setAgendaWindow("all");
      setExperienceId(null);
      setSubcategoryId(null);
      setResultsOpen(false);
      setFavouritesOnly(false);
    }
  };

  return (
    <main className={styles.shell} style={{ "--navigation-width": navigationMinimized && !isCompact ? "72px" : "460px" } as React.CSSProperties}>
      <TahoeGlassProvider
        scene={(
          <div
            ref={mapElementRef}
            className={styles.map}
            aria-label="Map of places to go in the UAE"
            aria-hidden={galleryOpen || (isCompact && (mobilePanelOpen || deityOpen))}
            inert={galleryOpen || (isCompact && (mobilePanelOpen || deityOpen))}
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
      <div className={styles.explorerContent} inert={galleryOpen || (isCompact && deityOpen)} aria-hidden={galleryOpen || (isCompact && deityOpen)}>
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

        <PlacesNavigation
          minimized={navigationMinimized}
          onMinimizedChange={changeNavigationMinimized}
          onAskDeity={() => changeDeityOpen(true)}
          compact={isCompact}
          open={mobilePanelOpen}
          experienceId={experienceId}
          subcategoryId={subcategoryId}
          resultsOpen={resultsOpen}
          savedOnly={favouritesOnly}
          savedCount={favourites.size}
          count={filteredPlaces.length}
          resultLabel={resultLabel}
          groupCounts={navigationCounts.groups}
          subcategoryCounts={navigationCounts.subcategories}
          emirates={emirates}
          emirate={emirate}
          locationMessage={locationMessage}
          datePlan={selectedDatePlan}
          agendaWindow={agendaWindow}
          onAgendaWindow={value => { setAgendaWindow(value); setSelectedId(null); }}
          onDatePlan={id => {
            setDatePlanId(id);
            setExperienceId(null);
            setSubcategoryId(null);
            setFavouritesOnly(false);
            setSelectedId(null);
            setResultsOpen(true);
          }}
          onExperience={chooseExperience}
          onSubcategory={chooseSubcategory}
          onBack={navigateBack}
          onResults={() => setResultsOpen(true)}
          onSaved={() => {
            setDatePlanId(null);
            setAgendaWindow("all");
            setFavouritesOnly(true);
            setExperienceId(null);
            setSubcategoryId(null);
            setResultsOpen(true);
            setSelectedId(null);
          }}
          onEmirate={value => { setEmirate(value); setDatePlanId(null); setSelectedId(null); }}
          onClose={closeMobilePanel}
          onMap={() => { fitPinsOnMap(); if (isCompact) closeMobilePanel(); }}
          onSurprise={surpriseMe}
          onLocate={locateMe}
          onReset={clearFilters}
        >

        <div className={styles.placeList}>
          {selectedDatePlan && <p className={styles.datePlanIntro}>{selectedDatePlan.description}</p>}
          {experienceId === "whats-on" && <>
            {category === "art-exhibitions" && <p className={styles.calendarDownload}><a href="/places/dubai/art-exhibitions.ics" download>Download all upcoming exhibitions (.ics)</a><span>Full exhibition calendar, across all areas and dates.</span></p>}
            <EventsAgenda entries={filteredAgenda} now={clientNow} onSelectPlace={place => selectPlace(place.id)} />
          </>}
          {experienceId !== "whats-on" && filteredPlaces.map((place) => {
            const meta = categoryFor(place);
            const closure = placeClosureNotice(place);
            const isFavourite = favourites.has(place.id);
            const distance = userLocation ? haversineKm(userLocation, place.coordinates) : null;
            const placeEvents = activeEventsByPlace.get(place.id) || [];
            const nextEvent = placeEvents[0] || null;
            return (
              <article
                key={place.id}
                className={`${styles.placeCard}${nextEvent ? ` ${styles.placeCardEvent}` : ""}${selectedId === place.id ? ` ${styles.placeCardSelected}` : ""}`}
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
                    {closure && (
                      <span className={styles.placeClosure}>
                        <CircleAlert size={12} aria-hidden="true" />
                        <span>{closure.label}</span>
                      </span>
                    )}
                    {nextEvent && (
                      <span className={styles.placeEvent}>
                        <CalendarDays size={11} aria-hidden="true" />
                        <span>{nextEvent.dateLabel}</span>
                        <b>{nextEvent.title}</b>
                      </span>
                    )}
                  </span>
                  {distance !== null && <span className={styles.distance}>{Math.round(distance)} km</span>}
                </button>
                <button
                  className={`${styles.heartButton}${isFavourite ? ` ${styles.heartButtonActive}` : ""}`}
                  type="button"
                  onClick={() => toggleFavourite(place.id)}
                  aria-label={isFavourite ? `Remove ${place.name} from saved places` : `Save ${place.name}`}
                >
                  <Heart size={16} fill={isFavourite ? "currentColor" : "none"} />
                </button>
              </article>
            );
          })}

          {!filteredPlaces.length && experienceId !== "whats-on" && (
            <div className={styles.emptyState}>
              <Sparkles size={24} />
              <strong>{favouritesOnly ? "No saved places in this area yet." : "No places in this collection here yet."}</strong>
              <button type="button" onClick={clearFilters}>Explore all experiences</button>
            </div>
          )}
          <footer className={styles.attribution}>
            <span>
              {availablePlaces.length} places from saved and curated records.
              {activeEventCount ? ` ${activeEventCount} current ${activeEventCount === 1 ? "event" : "events"}.` : ""}
              {` Latest research: ${editorialResearchedAt}.`}
            </span>
            <a
              href={payload.meta.geocoder === "google-places-new" ? "https://maps.google.com" : "https://www.openstreetmap.org/copyright"}
              target="_blank"
              rel="noreferrer"
            >
              {payload.meta.geocoder === "google-places-new" ? "Google Maps" : "© OpenStreetMap"}
            </a>
          </footer>
        </div>
        </PlacesNavigation>

        {!selectedPlace && !mobilePanelOpen && !deityOpen && (
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
              <PanelLeft size={18} />
              <span>Explore</span>
              <em>{filteredPlaces.length}</em>
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

        {selectedPlace && !deityOpen && (
          <TahoeGlassSurface
            ref={detailPanelRef}
            as="aside"
            variant="panel"
            radius={24}
            tone="dark"
            semanticTint="light"
            semanticTintOpacity={0.035}
            className={styles.detailCard}
            contentClassName={`${styles.detailFrame} relative`}
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

          <div className={styles.detailContent}>
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
            {selectedClosure && (
              <section className={styles.detailClosure} aria-label="Listing status">
                <CircleAlert size={17} aria-hidden="true" />
                <div>
                  <strong>{selectedClosure.label}</strong>
                  <p>
                    {selectedClosure.sourceLabel}{selectedClosure.checkedDate
                      ? ` checked ${selectedClosure.checkedDate}`
                      : "; check date unavailable"}.
                    {" "}Confirm directly with the venue before travelling.
                  </p>
                  {selectedClosure.note && <p>{selectedClosure.note}</p>}
                  {selectedClosure.sourceUrl && <a href={selectedClosure.sourceUrl} target="_blank" rel="noreferrer">Check venue source <ExternalLink size={12} aria-hidden="true" /></a>}
                </div>
              </section>
            )}
            <p className={styles.detailDescription}>{selectedPlace.description || "A saved place to explore together."}</p>
            <PlaceVisitGuide place={selectedPlace} places={availablePlaces} onPair={place => {
              clearFilters();
              setSelectedId(place.id);
              setMobilePanelOpen(false);
            }} />
            {selectedEvents.length > 0 && (
              <section className={styles.eventSection} aria-labelledby="selected-place-events-heading">
                <header className={styles.eventSectionHeader}>
                  <span>
                    <CalendarDays size={16} aria-hidden="true" />
                    <h3 id="selected-place-events-heading">What&apos;s on</h3>
                  </span>
                  <em>{selectedEvents.length}</em>
                </header>
                <div className={styles.eventList}>
                  {selectedEvents.map((event) => (
                    <article className={styles.eventItem} key={event.id}>
                      <p className={styles.eventDate}>{event.dateLabel}</p>
                      <h4>{event.title}</h4>
                      <p>{event.description}</p>
                      {event.visitNote && <p className={styles.exhibitionNote}>{event.visitNote}</p>}
                      <div className={styles.eventLinks}>
                        {event.bookingUrl && (
                          <a href={event.bookingUrl} target="_blank" rel="noreferrer">
                            Tickets &amp; info <ExternalLink size={13} aria-hidden="true" />
                          </a>
                        )}
                        {event.calendar && <a href={googleCalendarUrl(event, selectedPlace)!} target="_blank" rel="noreferrer">Add to Google Calendar <ExternalLink size={13} aria-hidden="true" /></a>}
                        {(!event.bookingUrl || event.sourceUrl !== event.bookingUrl) && (
                          <a href={event.sourceUrl} target="_blank" rel="noreferrer">
                            Details <ExternalLink size={13} aria-hidden="true" />
                          </a>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}
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
      <PlacesDeity
        open={deityOpen}
        compact={isCompact}
        launcherHidden={galleryOpen || (isCompact && mobilePanelOpen)}
        places={availablePlaces}
        selectedPlaceId={selectedId}
        filteredPlaceIds={filteredPlaces.map(place => place.id)}
        savedPlaceIds={[...favourites]}
        contextLabel={selectedPlace ? selectedPlace.name : `${resultLabel}${emirate === "all" ? " across the UAE" : ` in ${emirate}`}`}
        onOpenChange={changeDeityOpen}
        onSelectPlace={id => {
          // Recommendations can go beyond the active category; reveal the pin
          // before selecting it so the map and detail panel always agree.
          clearFilters();
          selectPlace(id);
        }}
      />
    </main>
  );
}
