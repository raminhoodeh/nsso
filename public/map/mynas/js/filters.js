/**
 * filters.js — myNAS Map
 * Manages all filter state, search, and UI interactions.
 * Exposes a global `FiltersModule` for map.js to consume.
 */

(function () {
  "use strict";

  // ── State ────────────────────────────────────────────────────────────────────
  const state = {
    activeTypes:    new Set(["Hospital", "Clinic", "Day Surgery Center"]),
    activeRegion:   "",
    activeBenefits: new Set(), // empty = all accepted
    searchQuery:    "",
    onChangeCallback: null,
  };

  // ── Register callback ────────────────────────────────────────────────────────
  function onChange(fn) {
    state.onChangeCallback = fn;
  }

  function notify() {
    updateFilterBadge();
    updateFilterCount();
    if (state.onChangeCallback) state.onChangeCallback(getFilters());
  }

  // ── Getters ──────────────────────────────────────────────────────────────────
  function getFilters() {
    return {
      types:    state.activeTypes,
      region:   state.activeRegion,
      benefits: state.activeBenefits,
      query:    state.searchQuery.toLowerCase().trim(),
    };
  }

  function matchesFilters(provider) {
    const f = getFilters();

    // Type filter
    if (!f.types.has(provider.type)) return false;

    // Region filter
    if (f.region && provider.region !== f.region) return false;

    // Benefits filter — all selected benefits must be covered
    if (f.benefits.size > 0) {
      const providerBenefits = provider.benefits || [];
      for (const required of f.benefits) {
        if (!providerBenefits.includes(required)) return false;
      }
    }

    // Search filter
    if (f.query) {
      const haystack = (provider.name + " " + provider.address + " " + provider.region).toLowerCase();
      if (!haystack.includes(f.query)) return false;
    }

    return true;
  }

  // ── Active filter count (for badge) ─────────────────────────────────────────
  function activeFilterCount() {
    let count = 0;
    if (state.activeTypes.size < 3) count++;
    if (state.activeRegion) count++;
    if (state.activeBenefits.size > 0) count++;
    if (state.searchQuery) count++;
    return count;
  }

  function updateFilterBadge() {
    const badge = document.getElementById("filter-badge");
    if (!badge) return;
    const count = activeFilterCount();
    if (count > 0) {
      badge.textContent = count;
      badge.classList.remove("hidden");
      // Trigger pop animation
      badge.classList.remove("pop");
      void badge.offsetWidth; // reflow
      badge.classList.add("pop");
    } else {
      badge.classList.add("hidden");
    }
  }

  function updateFilterCount() {
    // Count is set by map.js after filtering — we just expose a setter
  }

  // ── Public: set count text ───────────────────────────────────────────────────
  function setResultCount(visible, total) {
    const el = document.getElementById("filter-count");
    if (!el) return;
    el.textContent = `Showing ${visible.toLocaleString()} of ${total.toLocaleString()} providers`;
  }

  // ── Wire up DOM ──────────────────────────────────────────────────────────────
  function init() {
    // Type chips
    document.querySelectorAll(".chip[data-type]").forEach((chip) => {
      chip.addEventListener("click", () => {
        const type = chip.dataset.type;
        if (state.activeTypes.has(type)) {
          // Don't allow deselecting all
          if (state.activeTypes.size > 1) {
            state.activeTypes.delete(type);
            chip.classList.remove("active");
          }
        } else {
          state.activeTypes.add(type);
          chip.classList.add("active");
        }
        notify();
      });
    });

    // Region select
    const regionSelect = document.getElementById("region-filter");
    if (regionSelect) {
      regionSelect.addEventListener("change", () => {
        state.activeRegion = regionSelect.value;
        notify();
      });
    }

    // Benefits checkboxes
    document.querySelectorAll("#benefits-filters input[type=checkbox]").forEach((cb) => {
      // Start with all unchecked = all benefits allowed
      cb.checked = false;
      cb.addEventListener("change", () => {
        if (cb.checked) {
          state.activeBenefits.add(cb.value);
        } else {
          state.activeBenefits.delete(cb.value);
        }
        notify();
      });
    });

    // Search
    const searchInput = document.getElementById("search-input");
    const searchClear = document.getElementById("search-clear");
    let searchTimer = null;

    if (searchInput) {
      searchInput.addEventListener("input", () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
          state.searchQuery = searchInput.value;
          searchClear.style.display = searchInput.value ? "block" : "none";
          notify();
        }, 150);
      });
    }

    if (searchClear) {
      searchClear.addEventListener("click", () => {
        searchInput.value = "";
        state.searchQuery = "";
        searchClear.style.display = "none";
        searchInput.focus();
        notify();
      });
    }

    // Filter panel toggle
    const btnToggle = document.getElementById("btn-filter-toggle");
    const filterPanel = document.getElementById("filter-panel");
    const mapContainer = document.getElementById("map");
    const btnMinimize = document.getElementById("btn-minimize-panel");

    if (btnToggle && filterPanel) {
      btnToggle.addEventListener("click", () => {
        const isOpen = filterPanel.classList.toggle("open");
        mapContainer.classList.toggle("panel-open", isOpen);
      });
    }

    if (btnMinimize) {
      btnMinimize.addEventListener("click", () => {
        if (btnToggle) btnToggle.click();
      });
    }

    // Reset all
    const btnReset = document.getElementById("btn-reset-filters");
    if (btnReset) {
      btnReset.addEventListener("click", () => {
        // Types — re-enable all
        state.activeTypes = new Set(["Hospital", "Clinic", "Day Surgery Center"]);
        document.querySelectorAll(".chip[data-type]").forEach((c) => c.classList.add("active"));

        // Region
        state.activeRegion = "";
        if (regionSelect) regionSelect.value = "";

        // Benefits
        state.activeBenefits.clear();
        document.querySelectorAll("#benefits-filters input").forEach((cb) => {
          cb.checked = false;
        });

        // Search
        state.searchQuery = "";
        if (searchInput) searchInput.value = "";
        if (searchClear) searchClear.style.display = "none";

        notify();
      });
    }
  }

  // ── Public: render list ──────────────────────────────────────────────────────
  function renderProviderList(providers, onProviderClick) {
    const listContainer = document.getElementById("provider-list-container");
    if (!listContainer) return;
    
    listContainer.innerHTML = "";
    
    const maxItems = 100;
    const itemsToRender = providers.slice(0, maxItems);

    itemsToRender.forEach(p => {
      const item = document.createElement("div");
      item.className = "list-item";
      item.innerHTML = `
        <div class="list-item-name">${p.name}</div>
        <div class="list-item-region">${p.type} &bull; ${p.region}</div>
      `;
      item.addEventListener("click", () => {
        document.querySelectorAll(".list-item.selected").forEach(el => el.classList.remove("selected"));
        item.classList.add("selected");
        onProviderClick(p);
      });
      listContainer.appendChild(item);
    });
    
    if (providers.length > maxItems) {
      const more = document.createElement("div");
      more.className = "list-item-region";
      more.style.textAlign = "center";
      more.style.padding = "10px";
      more.textContent = `...and ${providers.length - maxItems} more (refine search or drag map)`;
      listContainer.appendChild(more);
    }
  }

  // ── Export ───────────────────────────────────────────────────────────────────
  window.FiltersModule = { init, onChange, matchesFilters, setResultCount, getFilters, renderProviderList };
})();
