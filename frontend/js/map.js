const DATA_URL = "/data/all_colleges.json";
const FACILITY_DATA_URL = "/nearby-facilities";
const LAST_PREDICTION_STORAGE_KEY = "rankroute_last_prediction";
const DEFAULT_CENTER = [12.9716, 77.5946];
const DEFAULT_ZOOM = 7;
const DEFAULT_ORIGIN = {
	latitude: 12.9716,
	longitude: 77.5946,
	label: "Bangalore",
};

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
	userLocation: null,
	locationErrorShown: false,
	userLocationMarker: null,
	facilityData: {},
	facilityLayer: null,
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

function formatDistanceKm(distanceKm) {
	if (!Number.isFinite(distanceKm)) {
		return "N/A";
	}
	if (distanceKm < 1) {
		return `${Math.round(distanceKm * 1000)} m away`;
	}
	return `${distanceKm.toFixed(1)} km away`;
}

function toRadians(degrees) {
	return (degrees * Math.PI) / 180;
}

function calculateDistanceKm(lat1, lng1, lat2, lng2) {
	const earthRadiusKm = 6371;
	const dLat = toRadians(lat2 - lat1);
	const dLng = toRadians(lng2 - lng1);
	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return earthRadiusKm * c;
}

function getOriginCoordinates() {
	if (state.userLocation && Number.isFinite(state.userLocation.latitude) && Number.isFinite(state.userLocation.longitude)) {
		return state.userLocation;
	}
	return DEFAULT_ORIGIN;
}

function getDistanceFromOrigin(college) {
	const origin = getOriginCoordinates();
	return calculateDistanceKm(origin.latitude, origin.longitude, college.latitude, college.longitude);
}

function parseDistanceKm(value) {
	const text = String(value || "").trim().toLowerCase();
	if (!text) {
		return null;
	}
	if (text.endsWith("km")) {
		const km = Number.parseFloat(text.replace("km", "").trim());
		return Number.isFinite(km) ? km : null;
	}
	if (text.endsWith("m")) {
		const meters = Number.parseFloat(text.replace("m", "").trim());
		return Number.isFinite(meters) ? meters / 1000 : null;
	}
	return null;
}

function loadNearbyFacilities() {
	return fetch(FACILITY_DATA_URL, { cache: "no-store" })
		.then((response) => {
			if (!response.ok) {
				throw new Error("Failed to load nearby facilities.");
			}
			return response.json();
		})
		.then((payload) => {
			const source = payload?.facilities || {};
			state.facilityData = Object.fromEntries(
				Object.entries(source).map(([name, details]) => [normalizeName(name), details])
			);
			return state.facilityData;
		})
		.catch(() => {
			state.facilityData = {};
			return state.facilityData;
		});
}

function getFacilitiesForCollege(college) {
	if (!college) {
		return null;
	}
	return state.facilityData[normalizeName(college.name)] || college.nearbyFacilities || null;
}

function renderFacilityRows(label, icon, facilities) {
	if (!Array.isArray(facilities) || !facilities.length) {
		return "";
	}

	const listItems = facilities
		.slice(0, 3)
		.map((facility) => `<li>${facility.name} - ${facility.distance || "N/A"}</li>`)
		.join("");

	return `
		<div class="facility-group">
			<div class="facility-title">${icon} ${label}</div>
			<ul>${listItems}</ul>
		</div>
	`;
}

function facilityConvenienceScore(facilities) {
	if (!facilities || typeof facilities !== "object") {
		return null;
	}

	const weights = { pgs: 2.2, metro: 2.2, bus: 1.8, food: 1.8, hospital: 2.0 };
	let weighted = 0;
	let max = 0;

	Object.entries(weights).forEach(([key, weight]) => {
		const entries = Array.isArray(facilities[key]) ? facilities[key] : [];
		max += weight;
		if (!entries.length) {
			return;
		}
		const nearest = entries
			.map((item) => parseDistanceKm(item.distance))
			.filter((distance) => Number.isFinite(distance))
			.sort((a, b) => a - b)[0];

		const factor = Number.isFinite(nearest)
			? Math.max(0.35, 1 - Math.min(nearest, 5) / 6)
			: 0.62;
		weighted += weight * factor;
	});

	if (!max) {
		return null;
	}

	const score = (weighted / max) * 10;
	return Math.max(0, Math.min(10, score));
}

function buildGoogleMapsDirectionsUrl(college) {
	const origin = getOriginCoordinates();
	const params = new URLSearchParams({
		api: "1",
		origin: `${origin.latitude},${origin.longitude}`,
		destination: `${college.latitude},${college.longitude}`,
		travelmode: "driving",
	});

	return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function openDirectionsForCollege(collegeId) {
	const college = state.collegeData.find((entry) => entry.id === collegeId);
	if (!college) {
		return;
	}

	const directionsUrl = buildGoogleMapsDirectionsUrl(college);
	window.location.href = directionsUrl;
}

function getUserMarkerIcon() {
	return L.divIcon({
		className: "map-user-marker-icon",
		html: '<div class="map-user-pin"></div>',
		iconSize: [20, 20],
		iconAnchor: [10, 10],
	});
}

function syncUserLocationMarker() {
	if (!state.map) {
		return;
	}

	if (!state.userLocation) {
		state.userLocationMarker?.remove();
		state.userLocationMarker = null;
		return;
	}

	const position = [state.userLocation.latitude, state.userLocation.longitude];
	if (!state.userLocationMarker) {
		state.userLocationMarker = L.marker(position, {
			icon: getUserMarkerIcon(),
			zIndexOffset: 800,
		});
		state.userLocationMarker.bindTooltip("You are here", {
			direction: "top",
			offset: [0, -8],
		});
		state.userLocationMarker.addTo(state.map);
		return;
	}

	state.userLocationMarker.setLatLng(position);
}

function requestUserLocation() {
	if (!navigator.geolocation) {
		return Promise.resolve(DEFAULT_ORIGIN);
	}

	return new Promise((resolve) => {
		navigator.geolocation.getCurrentPosition(
			(position) => {
				const coords = {
					latitude: position.coords.latitude,
					longitude: position.coords.longitude,
					label: "Current location",
				};
				state.userLocation = coords;
				resolve(coords);
			},
			() => {
				if (!state.locationErrorShown) {
					const toast = document.createElement("div");
					toast.className = "map-toast";
					toast.textContent = "Using Bangalore as a fallback for directions.";
					Object.assign(toast.style, {
						position: "fixed",
						right: "18px",
						bottom: "18px",
						background: "rgba(8,14,34,0.96)",
						color: "#eef4ff",
						padding: "10px 14px",
						borderRadius: "12px",
						boxShadow: "0 18px 42px rgba(2,6,20,0.45)",
						zIndex: 9999,
						fontSize: "13px",
						maxWidth: "280px",
					});
					document.body.appendChild(toast);
					setTimeout(() => toast.remove(), 2400);
					state.locationErrorShown = true;
				}
				state.userLocation = DEFAULT_ORIGIN;
				resolve(DEFAULT_ORIGIN);
			},
			{ enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
		);
	});
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
	const distanceBadge = `<div class="popup-row"><span>Distance from you</span><strong>${formatDistanceKm(getDistanceFromOrigin(college))}</strong></div>`;
	const facilities = getFacilitiesForCollege(college);
	const facilitySummary = facilities
		? `<div class="popup-row"><span>Facilities</span><strong>${[
			Array.isArray(facilities.pgs) ? facilities.pgs.length : 0,
			Array.isArray(facilities.metro) ? facilities.metro.length : 0,
			Array.isArray(facilities.bus) ? facilities.bus.length : 0,
			Array.isArray(facilities.food) ? facilities.food.length : 0,
			Array.isArray(facilities.hospital) ? facilities.hospital.length : 0,
		].reduce((sum, value) => sum + value, 0)} nearby</strong></div>`
		: '<div class="popup-row"><span>Facilities</span><strong>Not available</strong></div>';
	const score = facilityConvenienceScore(facilities);
	const convenienceRow = Number.isFinite(score)
		? `<div class="popup-row"><span>Convenience Score</span><strong>${score.toFixed(1)}/10</strong></div>`
		: "";

	return `
		<div class="popup-card">
			<h3>${college.name}</h3>
			<p class="popup-meta">${college.location || "Karnataka"}</p>
			<div class="popup-row"><span>NIRF Rank</span><strong>${rankLabel(college)}</strong></div>
			<div class="popup-row"><span>Location</span><strong>${college.location || "N/A"}</strong></div>
			${distanceBadge}
			${facilitySummary}
			${convenienceRow}
			${topRankedBadge}
			${predictedBadge}
			<div class="popup-actions">
				<button class="popup-button directions" type="button" data-action="directions" data-college-id="${college.id}"><i class="bi bi-sign-turn-right-fill" aria-hidden="true"></i><span>Show Directions</span></button>
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
			const facilities = getFacilitiesForCollege(college);
			const convenienceScore = facilityConvenienceScore(facilities);
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
						<div><strong>Distance:</strong> ${formatDistanceKm(getDistanceFromOrigin(college))}</div>
						<div><strong>Facilities:</strong> ${facilities ? "Available" : "Nearby facilities data not available"}</div>
						${Number.isFinite(convenienceScore) ? `<div><strong>Convenience Score:</strong> ${convenienceScore.toFixed(1)}/10</div>` : ""}
					</div>
					<div class="college-card-actions">
						<button class="direction-btn" type="button" data-direction-college-id="${college.id}"><i class="bi bi-sign-turn-right-fill" aria-hidden="true"></i><span>Show Directions</span></button>
					</div>
				</article>
			`;
		})
		.join("");

	list.querySelectorAll("[data-direction-college-id]").forEach((element) => {
		element.addEventListener("click", (event) => {
			event.stopPropagation();
			openDirectionsForCollege(Number(element.dataset.directionCollegeId));
		});
	});

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

function buildFacilityMarkerIcon(emoji) {
	return L.divIcon({
		className: "facility-marker-icon",
		html: `<span>${emoji}</span>`,
		iconSize: [26, 26],
		iconAnchor: [13, 13],
	});
}

function approximateFacilityPosition(college, item, index, total) {
	if (Number.isFinite(Number(item?.lat)) && Number.isFinite(Number(item?.lng))) {
		return [Number(item.lat), Number(item.lng)];
	}

	const radius = 0.0045;
	const angle = (2 * Math.PI * index) / Math.max(total, 1);
	return [
		college.latitude + radius * Math.sin(angle),
		college.longitude + radius * Math.cos(angle),
	];
}

function clearFacilityMarkers() {
	state.facilityLayer?.clearLayers();
}

function renderFacilityPanel(college) {
	const panel = document.getElementById("facilityPanelContent");
	if (!panel) {
		return;
	}

	if (!college) {
		panel.innerHTML = "Select a college marker or card to load nearby facilities.";
		return;
	}

	const facilities = getFacilitiesForCollege(college);
	if (!facilities) {
		panel.innerHTML = '<div class="facility-empty">Nearby facilities data not available</div>';
		return;
	}

	const score = facilityConvenienceScore(facilities);
	const groups = [
		renderFacilityRows("PGs / Hostels", "🏠", facilities.pgs),
		renderFacilityRows("Metro", "🚇", facilities.metro),
		renderFacilityRows("Bus Stops", "🚌", facilities.bus),
		renderFacilityRows("Food", "🍔", facilities.food),
		renderFacilityRows("Hospital", "🏥", facilities.hospital),
	].filter(Boolean).join("");

	panel.innerHTML = `
		<div class="facility-panel-header">
			<h3>${college.name}</h3>
			<p>${college.location || "Karnataka"}</p>
			${Number.isFinite(score) ? `<div class="facility-score">Convenience Score: ${score.toFixed(1)}/10</div>` : ""}
		</div>
		<div class="facility-panel-groups">${groups || '<div class="facility-empty">Nearby facilities data not available</div>'}</div>
	`;
}

function renderFacilityMarkers(college) {
	clearFacilityMarkers();
	if (!college || !state.facilityLayer) {
		return;
	}

	const facilities = getFacilitiesForCollege(college);
	if (!facilities) {
		return;
	}

	const categories = [
		{ key: "pgs", icon: "🏠", label: "PG / Hostel" },
		{ key: "metro", icon: "🚇", label: "Metro" },
		{ key: "bus", icon: "🚌", label: "Bus Stop" },
		{ key: "food", icon: "🍔", label: "Food" },
		{ key: "hospital", icon: "🏥", label: "Hospital" },
	];

	const items = categories.flatMap((category) => {
		const list = Array.isArray(facilities[category.key]) ? facilities[category.key] : [];
		return list.map((entry) => ({
			...entry,
			category: category.label,
			icon: category.icon,
		}));
	});

	items.forEach((item, index) => {
		const [lat, lng] = approximateFacilityPosition(college, item, index, items.length);
		const marker = L.marker([lat, lng], {
			icon: buildFacilityMarkerIcon(item.icon),
			zIndexOffset: 300,
		});
		marker.bindPopup(`
			<div class="facility-popup">
				<strong>${item.icon} ${item.name || "Facility"}</strong>
				<div>${item.category}</div>
				<div>${item.distance || "Distance not available"}</div>
			</div>
		`);
		state.facilityLayer.addLayer(marker);
	});
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

	renderFacilityPanel(college);
	renderFacilityMarkers(college);

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
	clearFacilityMarkers();
	renderFacilityPanel(null);
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
		const directionButton = event.target.closest?.('.popup-button.directions[data-action="directions"][data-college-id]');
		if (directionButton) {
			event.preventDefault();
			openDirectionsForCollege(Number(directionButton.dataset.collegeId));
			return;
		}

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
			nearbyFacilities: state.facilityData[normalizeName(college.name || college.college_name)] || null,
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
		attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" rel="noopener noreferrer">OpenStreetMap</a> contributors',
		maxZoom: 19,
	}).addTo(state.map);

	state.markerLayer = typeof L.markerClusterGroup === "function"
		? L.markerClusterGroup({ chunkedLoading: true, showCoverageOnHover: false, spiderfyOnMaxZoom: true })
		: L.layerGroup();
	state.markerLayer.addTo(state.map);
	state.facilityLayer = L.layerGroup().addTo(state.map);

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
	renderFacilityPanel(null);

	const loading = document.getElementById("loadingOverlay");
	try {
		await requestUserLocation();
		await loadNearbyFacilities();
		await loadCollegeData();
		initializeMap();
		syncUserLocationMarker();
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
