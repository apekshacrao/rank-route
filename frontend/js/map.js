const DATA_URL = "/data/all_colleges.json";
const LAST_PREDICTION_STORAGE_KEY = "rankroute_last_prediction";
const DEFAULT_CENTER = [12.9716, 77.5946];
const DEFAULT_ZOOM = 7;

const state = {
	map: null,
	markerLayer: null,
	collegeData: [],
	filteredColleges: [],
	markerById: new Map(),
	activeCollegeId: null,
	hoveredCollegeId: null,
	selectedPredictionNames: new Set(),
	search: "",
	loading: true,
};

function normalizeName(value) {
	return String(value || "").trim().toLowerCase();
}

function parseRank(value) {
	const rank = Number(value);
	return Number.isFinite(rank) && rank > 0 ? rank : null;
}

function getStoredPredictionState() {
	const raw = localStorage.getItem(LAST_PREDICTION_STORAGE_KEY);
	if (!raw) {
		return null;
	}

	try {
		return JSON.parse(raw);
	} catch (_error) {
		return null;
	}
}

function isTopRanked(college) {
	return Number.isFinite(college.nirfRank) && college.nirfRank < 100;
}

function rankLabel(college) {
	return Number.isFinite(college.nirfRank) ? `#${college.nirfRank}` : "N/A";
}

function getMarkerColor(college) {
	if (isTopRanked(college)) {
		return "green";
	}
	if (Number.isFinite(college.nirfRank) && college.nirfRank <= 200) {
		return "yellow";
	}
	return "red";
}

function getMarkerIcon(color, selected = false, highlighted = false, topRanked = false) {
	return L.divIcon({
		className: "map-marker-icon",
		html: `
			<div class="map-pin ${color} ${selected ? "is-selected" : ""} ${highlighted ? "is-highlighted" : ""} ${topRanked ? "is-top-ranked" : ""}">
				<span class="map-pin-dot"></span>
			</div>
		`,
		iconSize: [28, 40],
		iconAnchor: [14, 38],
		popupAnchor: [0, -34],
	});
}

function renderStatus(message, variant = "neutral") {
	const pill = document.getElementById("mapStatusPill");
	if (!pill) {
		return;
	}
	pill.textContent = message;
	pill.dataset.variant = variant;
}

function updateHeaderCounts() {
	const total = document.getElementById("collegeCount");
	const topRanked = document.getElementById("predictedCount");
	const visible = document.getElementById("distanceStatus");

	if (total) {
		total.textContent = String(state.collegeData.length);
	}
	if (topRanked) {
		topRanked.textContent = String(state.collegeData.filter(isTopRanked).length);
	}
	if (visible) {
		visible.textContent = String(state.filteredColleges.length);
	}
}

function getVisibleColleges() {
	const search = state.search.trim().toLowerCase();
	return state.collegeData.filter((college) => {
		if (!search) {
			return true;
		}

		return normalizeName(college.name).includes(search) || normalizeName(college.location).includes(search);
	});
}

function collegeMatchesPrediction(college) {
	return state.selectedPredictionNames.has(normalizeName(college.name));
}

function buildPopupHtml(college) {
	const topRankedBadge = isTopRanked(college)
		? '<div class="popup-row"><span>Status</span><strong>Top Ranked</strong></div>'
		: "";
	const predictedBadge = collegeMatchesPrediction(college)
		? '<div class="popup-row"><span>Prediction</span><strong>Predicted</strong></div>'
		: "";

	return `
		<div class="popup-card">
			<h3>${college.name}</h3>
			<p class="popup-meta">${college.location || "Karnataka"}</p>
			<div class="popup-row"><span>NIRF Rank</span><strong>${rankLabel(college)}</strong></div>
			<div class="popup-row"><span>Location</span><strong>${college.location || "N/A"}</strong></div>
			${topRankedBadge}
			${predictedBadge}
			<div class="popup-actions">
				<button class="popup-button ghost" type="button" data-college-id="${college.id}">Focus college</button>
			</div>
		</div>
	`;
}

function createMarker(college) {
	const marker = L.marker([college.latitude, college.longitude], {
		icon: getMarkerIcon(getMarkerColor(college), false, false, isTopRanked(college)),
		riseOnHover: true,
	});

	marker.bindPopup(buildPopupHtml(college), {
		maxWidth: 320,
		closeButton: true,
		autoPanPadding: [20, 20],
	});

	marker.on("click", () => {
		setActiveCollege(college.id, { panMap: true, openPopup: true });
	});

	marker.on("mouseover", () => {
		setHoveredCollege(college.id);
	});

	marker.on("mouseout", () => {
		setHoveredCollege(null);
	});

	marker.on("popupopen", (event) => {
		const focusButton = event.popup.getElement()?.querySelector('[data-college-id]');
		if (focusButton) {
			focusButton.addEventListener("click", () => setActiveCollege(college.id, { panMap: true, openPopup: true }));
		}
	});

	return marker;
}

function syncMarkerStyles() {
	state.markerById.forEach((marker, collegeId) => {
		const college = state.collegeData.find((entry) => entry.id === collegeId);
		if (!college) {
			return;
		}

		const selected = state.activeCollegeId === collegeId;
		const highlighted = state.hoveredCollegeId === collegeId || selected;
		marker.setIcon(getMarkerIcon(getMarkerColor(college), selected, highlighted, isTopRanked(college)));
	});
}

function renderCollegeList() {
	const list = document.getElementById("collegeList");
	if (!list) {
		return;
	}

	const colleges = state.filteredColleges
		.slice()
		.sort((left, right) => {
			const leftRank = Number.isFinite(left.nirfRank) ? left.nirfRank : Number.POSITIVE_INFINITY;
			const rightRank = Number.isFinite(right.nirfRank) ? right.nirfRank : Number.POSITIVE_INFINITY;
			if (leftRank !== rightRank) {
				return leftRank - rightRank;
			}
			return left.name.localeCompare(right.name);
		});

	if (!colleges.length) {
		list.innerHTML = '<div class="empty-state">No colleges match the current search.</div>';
		updateHeaderCounts();
		return;
	}

	list.innerHTML = colleges
		.map((college) => {
			const active = state.activeCollegeId === college.id;
			const hovered = state.hoveredCollegeId === college.id;
			const topRanked = isTopRanked(college);
			const predicted = collegeMatchesPrediction(college);
			return `
				<article class="college-card ${active ? "is-active" : ""} ${hovered ? "is-hovered" : ""} ${topRanked ? "is-top-ranked" : ""} ${predicted ? "is-predicted" : ""}" data-college-id="${college.id}" tabindex="0" role="button">
					<div class="college-card-head">
						<div>
							<h3>${college.name}</h3>
							<div class="college-badges">
								${topRanked ? '<span class="chip top-ranked">Top Ranked</span>' : ""}
								${predicted ? '<span class="chip predicted">Predicted</span>' : ""}
							</div>
						</div>
					</div>
					<div class="college-card-meta">
						<div><strong>NIRF Rank:</strong> ${rankLabel(college)}</div>
						<div><strong>Location:</strong> ${college.location || "Karnataka"}</div>
					</div>
				</article>
			`;
		})
		.join("");

	list.querySelectorAll("[data-college-id]").forEach((element) => {
		const collegeId = Number(element.dataset.collegeId);
		element.addEventListener("click", () => {
			setActiveCollege(collegeId, { panMap: true, openPopup: true });
		});
		element.addEventListener("mouseenter", () => {
			setHoveredCollege(collegeId);
		});
		element.addEventListener("mouseleave", () => {
			setHoveredCollege(null);
		});
		element.addEventListener("focus", () => {
			setHoveredCollege(collegeId);
		});
		element.addEventListener("blur", () => {
			setHoveredCollege(null);
		});
		element.addEventListener("keydown", (event) => {
			if (event.key === "Enter" || event.key === " ") {
				event.preventDefault();
				setActiveCollege(collegeId, { panMap: true, openPopup: true });
			}
		});
	});

	updateHeaderCounts();
}

function syncMarkerLayer() {
	if (!state.markerLayer) {
		return;
	}

	state.markerLayer.clearLayers();
	state.filteredColleges.forEach((college) => {
		const marker = state.markerById.get(college.id);
		if (marker) {
			state.markerLayer.addLayer(marker);
		}
	});
	syncMarkerStyles();
}

function fitVisibleBounds(colleges) {
	if (!colleges.length || !state.map) {
		return;
	}

	const bounds = L.latLngBounds(colleges.map((college) => [college.latitude, college.longitude]));
	state.map.fitBounds(bounds.pad(0.15), { animate: true });
}

function fitTopRankedBounds() {
	const topRanked = state.filteredColleges.filter(isTopRanked);
	if (topRanked.length) {
		fitVisibleBounds(topRanked);
		setActiveCollege(topRanked[0].id, { panMap: false, openPopup: true });
		return;
	}

	fitVisibleBounds(state.filteredColleges);
}

function setHoveredCollege(collegeId) {
	if (state.hoveredCollegeId === collegeId) {
		return;
	}

	state.hoveredCollegeId = collegeId;
	syncMarkerStyles();
	renderCollegeList();
}

function setActiveCollege(collegeId, { panMap = true, openPopup = true } = {}) {
	state.activeCollegeId = collegeId;
	syncMarkerStyles();

	const college = state.collegeData.find((entry) => entry.id === collegeId);
	if (!college || !state.map) {
		return;
	}

	if (panMap) {
		state.map.setView([college.latitude, college.longitude], Math.max(state.map.getZoom(), 12), { animate: true });
	}

	if (openPopup) {
		state.markerById.get(collegeId)?.openPopup();
	}

	renderCollegeList();
}

function clearSelection() {
	state.activeCollegeId = null;
	state.map?.closePopup();
	syncMarkerStyles();
	renderCollegeList();
}

function applyFilters() {
	state.filteredColleges = getVisibleColleges();
	syncMarkerLayer();
	renderCollegeList();
	updateHeaderCounts();
	renderStatus(`Showing ${state.filteredColleges.length} of ${state.collegeData.length} colleges`, state.filteredColleges.length ? "neutral" : "warning");

	if (state.activeCollegeId && !state.filteredColleges.some((college) => college.id === state.activeCollegeId)) {
		clearSelection();
	}
}

function syncPredictionState() {
	const predictionState = getStoredPredictionState();
	const predictions = predictionState?.response?.predictions || [];
	state.selectedPredictionNames = new Set(predictions.map((item) => normalizeName(item.college || item.college_name)));
	updateHeaderCounts();
}

function bindControls() {
	document.getElementById("locationSearch")?.addEventListener("input", (event) => {
		state.search = event.target.value;
		applyFilters();
	});

	document.getElementById("focusTopRankedBtn")?.addEventListener("click", fitTopRankedBounds);
	document.getElementById("fitAllBtn")?.addEventListener("click", () => fitVisibleBounds(state.filteredColleges));
}

function popupActionHandlers() {
	document.addEventListener("click", (event) => {
		const button = event.target.closest?.(".popup-button.ghost[data-college-id]");
		if (!button) {
			return;
		}
		setActiveCollege(Number(button.dataset.collegeId), { panMap: true, openPopup: true });
	});
}

async function loadCollegeData() {
	const response = await fetch(DATA_URL, { cache: "no-store" });
	if (!response.ok) {
		throw new Error("Failed to load college data.");
	}

	const data = await response.json();
	const source = Array.isArray(data) ? data : data.colleges || [];
	state.collegeData = source
		.filter((college) => Number.isFinite(Number(college.lat ?? college.latitude)) && Number.isFinite(Number(college.lng ?? college.longitude)))
		.map((college, index) => ({
			id: index + 1,
			name: String(college.name || college.college_name || "").trim(),
			latitude: Number(college.lat ?? college.latitude),
			longitude: Number(college.lng ?? college.longitude),
			nirfRank: parseRank(college.nirf_rank ?? college.nirfRank),
			location: String(college.location || college.city || college.area || "Karnataka").trim() || "Karnataka",
			searchText: normalizeName(`${college.name || college.college_name || ""} ${college.location || college.city || college.area || ""}`),
		}));

	state.collegeData.sort((left, right) => {
		const leftRank = Number.isFinite(left.nirfRank) ? left.nirfRank : Number.POSITIVE_INFINITY;
		const rightRank = Number.isFinite(right.nirfRank) ? right.nirfRank : Number.POSITIVE_INFINITY;
		if (leftRank !== rightRank) {
			return leftRank - rightRank;
		}
		return left.name.localeCompare(right.name);
	});

	state.markerById.clear();
	state.collegeData.forEach((college) => {
		state.markerById.set(college.id, createMarker(college));
	});
}

function initializeMap() {
	state.map = L.map("mapCanvas", {
		zoomControl: true,
		preferCanvas: true,
	}).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

	L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
		attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
		maxZoom: 19,
	}).addTo(state.map);

	state.markerLayer = typeof L.markerClusterGroup === "function"
		? L.markerClusterGroup({ chunkedLoading: true, showCoverageOnHover: false, spiderfyOnMaxZoom: true })
		: L.layerGroup();
	state.markerLayer.addTo(state.map);

	state.map.on("click", clearSelection);
	state.map.on("zoomstart", () => {
		state.map.closePopup();
	});
}

function showFallback(message) {
	const fallback = document.getElementById("mapFallback");
	const loading = document.getElementById("loadingOverlay");
	if (loading) {
		loading.classList.add("hidden");
	}
	if (fallback) {
		fallback.classList.remove("hidden");
		fallback.innerHTML = `<div><strong>Map unavailable</strong><p>${message}</p></div>`;
	}
}

async function bootMapExplorer() {
	bindControls();
	popupActionHandlers();
	syncPredictionState();

	const loading = document.getElementById("loadingOverlay");
	try {
		await loadCollegeData();
		initializeMap();
		if (loading) {
			loading.classList.add("hidden");
		}
		state.filteredColleges = getVisibleColleges();
		syncMarkerLayer();
		renderCollegeList();
		renderStatus(`Loaded ${state.collegeData.length} colleges from the Karnataka dataset`, "success");
		fitVisibleBounds(state.filteredColleges);
	} catch (error) {
		showFallback(error.message || "Could not load the college map.");
		renderStatus("Failed to load map data.", "warning");
	}
}

window.addEventListener("storage", (event) => {
	if (event.key === LAST_PREDICTION_STORAGE_KEY) {
		syncPredictionState();
		syncMarkerStyles();
		renderCollegeList();
	}
});

document.addEventListener("DOMContentLoaded", bootMapExplorer);
