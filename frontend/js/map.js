const API_BASE_URL = "http://127.0.0.1:5000";
const LAST_PREDICTION_STORAGE_KEY = "rankroute_last_prediction";
const DEFAULT_CENTER = [12.9716, 77.5946];
const DEFAULT_ZOOM = 8;
const BANGALORE_CENTER = [12.9716, 77.5946];

const state = {
	map: null,
	markerLayer: null,
	collegeData: [],
	filteredColleges: [],
	markerById: new Map(),
	activeCollegeId: null,
	selectedPredictionNames: new Set(),
	userLocation: null,
	branch: "ALL",
	rank: 4000,
	search: "",
	loading: true,
};

function normalizeName(value) {
	return String(value || "").trim().toLowerCase();
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

function chanceFromRank(rank, cutoff) {
	if (!Number.isFinite(rank) || !Number.isFinite(cutoff) || cutoff <= 0) {
		return { label: "Medium", color: "yellow" };
	}

	if (rank <= cutoff * 0.85) {
		return { label: "High", color: "green" };
	}

	if (rank <= cutoff) {
		return { label: "Medium", color: "yellow" };
	}

	return { label: "Low", color: "red" };
}

function haversineKm(origin, destination) {
	const toRad = (degrees) => (degrees * Math.PI) / 180;
	const earthRadiusKm = 6371;
	const dLat = toRad(destination[0] - origin[0]);
	const dLng = toRad(destination[1] - origin[1]);
	const lat1 = toRad(origin[0]);
	const lat2 = toRad(destination[0]);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
	return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

function formatDistance(distanceKm) {
	if (!Number.isFinite(distanceKm)) {
		return "Distance unavailable";
	}
	return `${distanceKm.toFixed(distanceKm < 10 ? 1 : 0)} km away`;
}

function getCutoffValue(college) {
	const cutoff = college.cutoff ?? college.cutoffs?.GM ?? college.cutoffs?.[college.branch];
	return Number.isFinite(Number(cutoff)) ? Number(cutoff) : null;
}

function getDirectionsUrl(college) {
	return `https://www.google.com/maps/dir/?api=1&destination=${college.latitude},${college.longitude}`;
}

function getMarkerIcon(color, selected = false, highlighted = false) {
	return L.divIcon({
		className: "map-marker-icon",
		html: `
			<div class="map-pin ${color} ${selected ? "is-selected" : ""} ${highlighted ? "is-highlighted" : ""}">
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
	const predicted = document.getElementById("predictedCount");
	const distanceMode = document.getElementById("distanceStatus");

	if (total) {
		total.textContent = String(state.collegeData.length);
	}
	if (predicted) {
		predicted.textContent = String(state.selectedPredictionNames.size);
	}
	if (distanceMode) {
		distanceMode.textContent = state.userLocation ? "Enabled" : "Default Bangalore";
	}
}

function getVisibleColleges() {
	const search = state.search.trim().toLowerCase();
	return state.collegeData.filter((college) => {
		const matchesBranch = state.branch === "ALL" || college.branch === state.branch;
		const matchesSearch =
			!search ||
			normalizeName(college.name).includes(search) ||
			normalizeName(college.area).includes(search) ||
			normalizeName(college.city).includes(search);
		return matchesBranch && matchesSearch;
	});
}

function buildPopupHtml(college) {
	const chance = chanceFromRank(state.rank, college.cutoff);
	const distanceText = college.distanceText || "Distance unavailable";
	const branches = college.branches?.length ? college.branches.join(", ") : college.branch || "N/A";

	return `
		<div class="popup-card">
			<h3>${college.name}</h3>
			<p class="popup-meta">${college.area ? `${college.area} | ` : ""}${college.city || "Karnataka"}</p>
			<div class="popup-row"><span>Branch</span><strong>${branches}</strong></div>
			<div class="popup-row"><span>Cutoff</span><strong>${college.cutoff ?? "N/A"}</strong></div>
			<div class="popup-row"><span>Admission chance</span><strong class="chance-${chance.color}">${chance.label}</strong></div>
			<div class="popup-row"><span>Distance</span><strong>${distanceText}</strong></div>
			<div class="popup-actions">
				<a class="popup-button primary" href="${getDirectionsUrl(college)}" target="_blank" rel="noopener noreferrer">Get Directions</a>
				<button class="popup-button ghost" type="button" data-college-id="${college.id}">Focus college</button>
			</div>
		</div>
	`;
}

function collegeMatchesPrediction(college) {
	return state.selectedPredictionNames.has(normalizeName(college.name));
}

function updateCollegeDistance(college) {
	if (!state.userLocation) {
		college.distanceKm = haversineKm(BANGALORE_CENTER, [college.latitude, college.longitude]);
	} else {
		college.distanceKm = haversineKm([state.userLocation.lat, state.userLocation.lng], [college.latitude, college.longitude]);
	}
	college.distanceText = formatDistance(college.distanceKm);
}

function getCollegeIconColor(college) {
	const chance = chanceFromRank(state.rank, college.cutoff);
	return chance.color;
}

function createMarker(college) {
	const highlighted = collegeMatchesPrediction(college);
	const icon = getMarkerIcon(getCollegeIconColor(college), false, highlighted);
	const marker = L.marker([college.latitude, college.longitude], { icon, riseOnHover: true });
	marker.bindPopup(buildPopupHtml(college), { maxWidth: 300, closeButton: true, autoPanPadding: [20, 20] });

	marker.on("click", () => {
		setActiveCollege(college.id, { panMap: true, openPopup: true });
	});

	marker.on("popupopen", (event) => {
		const focusButton = event.popup.getElement()?.querySelector('[data-college-id]');
		if (focusButton) {
			focusButton.addEventListener("click", () => setActiveCollege(college.id, { panMap: true, openPopup: true }));
		}
	});

	return marker;
}

function setMarkerStyle(college, marker, selected = false) {
	const highlighted = collegeMatchesPrediction(college);
	marker.setIcon(getMarkerIcon(getCollegeIconColor(college), selected, highlighted));
	const element = marker.getElement();
	if (element) {
		element.classList.toggle("is-predicted", highlighted);
	}
}

function renderCollegeList() {
	const list = document.getElementById("collegeList");
	if (!list) {
		return;
	}

	const colleges = state.filteredColleges
		.slice()
		.sort((left, right) => {
			const leftPredicted = collegeMatchesPrediction(left);
			const rightPredicted = collegeMatchesPrediction(right);
			if (leftPredicted !== rightPredicted) {
				return leftPredicted ? -1 : 1;
			}
			return (left.cutoff ?? 999999) - (right.cutoff ?? 999999);
		});

	if (!colleges.length) {
		list.innerHTML = '<div class="empty-state">No colleges match the current filters.</div>';
		updateHeaderCounts();
		return;
	}

	list.innerHTML = colleges
		.map((college) => {
			const chance = chanceFromRank(state.rank, college.cutoff);
			const predicted = collegeMatchesPrediction(college);
			const active = state.activeCollegeId === college.id;
			return `
				<article class="college-card ${active ? "is-active" : ""} ${predicted ? "is-predicted" : ""}" data-college-id="${college.id}" tabindex="0" role="button">
					<div class="college-card-head">
						<div>
							<h3>${college.name}</h3>
							<div class="college-badges">
								<span class="chip ${chance.color}">${chance.label} chance</span>
								${predicted ? '<span class="chip predicted">Predicted</span>' : ""}
							</div>
						</div>
						<a class="college-link" href="${getDirectionsUrl(college)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();">Directions</a>
					</div>
					<div class="college-card-meta">
						<div><strong>Branch:</strong> ${college.branch}</div>
						<div><strong>Cutoff:</strong> ${college.cutoff ?? "N/A"}</div>
						<div><strong>Distance:</strong> ${college.distanceText || "Calculating..."}</div>
						<div><strong>Location:</strong> ${college.area || college.city || "Karnataka"}</div>
					</div>
				</article>
			`;
		})
		.join("");

	list.querySelectorAll("[data-college-id]").forEach((element) => {
		element.addEventListener("click", () => {
			setActiveCollege(Number(element.dataset.collegeId), { panMap: true, openPopup: true });
		});
		element.addEventListener("keydown", (event) => {
			if (event.key === "Enter" || event.key === " ") {
				event.preventDefault();
				setActiveCollege(Number(element.dataset.collegeId), { panMap: true, openPopup: true });
			}
		});
	});

	updateHeaderCounts();
}

function syncListAndMarkers() {
	const visibleIds = new Set(state.filteredColleges.map((college) => college.id));
	state.markerLayer.clearLayers();

	state.markerById.forEach((marker, collegeId) => {
		const college = state.collegeData.find((entry) => entry.id === collegeId);
		if (!college) {
			return;
		}

		const visible = visibleIds.has(collegeId);
		marker.setOpacity(visible ? 1 : 0);
		if (visible) {
			setMarkerStyle(college, marker, state.activeCollegeId === collegeId);
			state.markerLayer.addLayer(marker);
		}
	});
}

function fitVisibleBounds(colleges) {
	if (!colleges.length || !state.map) {
		return;
	}

	const bounds = L.latLngBounds(colleges.map((college) => [college.latitude, college.longitude]));
	state.map.fitBounds(bounds.pad(0.15), { animate: true });
}

function fitPredictedBounds() {
	const predicted = state.filteredColleges.filter((college) => collegeMatchesPrediction(college));
	if (predicted.length) {
		fitVisibleBounds(predicted);
		setActiveCollege(predicted[0].id, { panMap: false, openPopup: true });
	}
}

function setActiveCollege(collegeId, { panMap = true, openPopup = true } = {}) {
	state.activeCollegeId = collegeId;

	state.markerById.forEach((marker, markerId) => {
		const college = state.collegeData.find((entry) => entry.id === markerId);
		if (college) {
			setMarkerStyle(college, marker, markerId === collegeId);
		}
	});

	const college = state.collegeData.find((entry) => entry.id === collegeId);
	if (!college || !state.map) {
		return;
	}

	if (panMap) {
		state.map.setView([college.latitude, college.longitude], Math.max(state.map.getZoom(), 13), { animate: true });
	}

	if (openPopup) {
		state.markerById.get(collegeId)?.openPopup();
	}

	renderCollegeList();
}

function clearSelection() {
	state.activeCollegeId = null;
	state.map?.closePopup();
	renderCollegeList();
}

function applyFilters() {
	state.filteredColleges = getVisibleColleges();
	state.filteredColleges.forEach(updateCollegeDistance);

	syncListAndMarkers();
	renderCollegeList();
	renderStatus(`${state.filteredColleges.length} colleges visible`, state.filteredColleges.length ? "neutral" : "warning");

	if (state.activeCollegeId && !state.filteredColleges.some((college) => college.id === state.activeCollegeId)) {
		clearSelection();
	}

	if (!state.activeCollegeId && state.filteredColleges.length) {
		fitVisibleBounds(state.filteredColleges);
	}

	if (state.selectedPredictionNames.size) {
		fitPredictedBounds();
	}
}

function syncPredictionState() {
	const predictionState = getStoredPredictionState();
	const predictions = predictionState?.response?.predictions || [];
	const request = predictionState?.request || {};

	state.selectedPredictionNames = new Set(predictions.map((item) => normalizeName(item.college || item.college_name)));

	if (request.preferred_branch) {
		state.branch = request.preferred_branch;
		const branchFilter = document.getElementById("branchFilter");
		if (branchFilter) {
			branchFilter.value = state.branch;
		}
	}

	if (request.rank) {
		state.rank = Number(request.rank);
		const rankFilter = document.getElementById("rankFilter");
		if (rankFilter) {
			rankFilter.value = String(state.rank);
		}
	}

	updateHeaderCounts();
}

function bindControls() {
	document.getElementById("branchFilter")?.addEventListener("change", (event) => {
		state.branch = event.target.value;
		applyFilters();
	});

	document.getElementById("rankFilter")?.addEventListener("input", (event) => {
		state.rank = Number(event.target.value) || 0;
		applyFilters();
	});

	document.getElementById("locationSearch")?.addEventListener("input", (event) => {
		state.search = event.target.value;
		applyFilters();
	});

	document.getElementById("focusPredictedBtn")?.addEventListener("click", fitPredictedBounds);
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

function loadCollegeData() {
	return fetch(`${API_BASE_URL}/colleges`)
		.then((response) => response.json().then((data) => ({ response, data })))
		.then(({ response, data }) => {
			if (!response.ok) {
				throw new Error(data.error || "Failed to load colleges.");
			}

			state.collegeData = (data.colleges || [])
				.filter((college) => Number.isFinite(Number(college.latitude)) && Number.isFinite(Number(college.longitude)))
				.map((college, index) => ({
					id: index + 1,
					name: college.college_name,
					latitude: Number(college.latitude),
					longitude: Number(college.longitude),
					cutoff: Number(college.cutoff ?? college.cutoffs?.GM ?? 0) || null,
					branch: String(college.branch || "").toUpperCase(),
					branches: Array.isArray(college.branches) && college.branches.length ? college.branches : [String(college.branch || "").toUpperCase()],
					area: college.area || "",
					city: college.city || "Karnataka",
					cutoffs: college.cutoffs || {},
					distanceKm: null,
					distanceText: "",
				}));
			state.collegeData.forEach((college) => {
				state.markerById.set(college.id, createMarker(college));
			});
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
		? L.markerClusterGroup({ chunkedLoading: true, showCoverageOnHover: false })
		: L.layerGroup();
	state.markerLayer.addTo(state.map);

	state.map.on("click", clearSelection);
	state.map.on("zoomstart", () => {
		state.map.closePopup();
	});
}

function addUserMarker(location, label = "You are here") {
	if (!state.map) {
		return;
	}

	if (state.userMarker) {
		state.map.removeLayer(state.userMarker);
	}

	state.userMarker = L.marker(location, {
		icon: L.divIcon({
			className: "map-marker-icon user-marker-icon",
			html: '<div class="map-user-pin"></div>',
			iconSize: [24, 24],
			iconAnchor: [12, 12],
		}),
	}).addTo(state.map).bindPopup(`<strong>${label}</strong>`);
}

function enableUserLocation() {
	if (!navigator.geolocation) {
		state.userLocation = { lat: BANGALORE_CENTER[0], lng: BANGALORE_CENTER[1] };
		addUserMarker(BANGALORE_CENTER, "Bangalore (default)");
		renderStatus("Geolocation not available. Using Bangalore as the default location.", "warning");
		return Promise.resolve();
	}

	return new Promise((resolve) => {
		navigator.geolocation.getCurrentPosition(
			(position) => {
				state.userLocation = { lat: position.coords.latitude, lng: position.coords.longitude };
				addUserMarker([state.userLocation.lat, state.userLocation.lng], "You are here");
				renderStatus("Location enabled. Distances updated.", "success");
				resolve();
			},
			() => {
				state.userLocation = { lat: BANGALORE_CENTER[0], lng: BANGALORE_CENTER[1] };
				addUserMarker(BANGALORE_CENTER, "Bangalore (default)");
				renderStatus("Location permission denied. Showing Bangalore as the default location.", "warning");
				resolve();
			},
			{ enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
		);
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
		await enableUserLocation();
		if (loading) {
			loading.classList.add("hidden");
		}
		state.filteredColleges = getVisibleColleges();
		state.filteredColleges.forEach(updateCollegeDistance);
		state.filteredColleges.forEach((college) => {
			const marker = state.markerById.get(college.id);
			if (marker) {
				marker.bindPopup(buildPopupHtml(college), { maxWidth: 300, closeButton: true, autoPanPadding: [20, 20] });
			}
		});
		applyFilters();
		renderStatus(`${state.collegeData.length} colleges loaded`, "success");
		if (state.selectedPredictionNames.size) {
			fitPredictedBounds();
		}
	} catch (error) {
		showFallback(error.message || "Could not load the college map.");
		renderStatus("Failed to load map data.", "warning");
	}
}

window.addEventListener("storage", (event) => {
	if (event.key === LAST_PREDICTION_STORAGE_KEY) {
		syncPredictionState();
		applyFilters();
	}
});

document.addEventListener("DOMContentLoaded", bootMapExplorer);