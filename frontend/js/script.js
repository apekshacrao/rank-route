const API_BASE_URL = window.location.origin || "http://127.0.0.1:5000";
const FACILITIES_API_URL = `${API_BASE_URL}/nearby-facilities`;
const SUBJECT_ANALYSIS_STORAGE_KEY = "kcet_subject_scores";
const SUBJECT_TARGET_SCORE = 85;
const LAST_PREDICTION_STORAGE_KEY = "rankroute_last_prediction";
const DEFAULT_USER_LOCATION = { lat: 12.9716, lng: 77.5946, source: "Bangalore" };

let subjectScoreChartInstance = null;
let subjectGapChartInstance = null;
let cutoffChartInstance = null;
let dashboardMap = null;
let dashboardMarkerLayer = null;
let collegesData = [];
let userLocation = null; // {lat, lng}
let locationErrorShown = false;
let facilitiesByCollege = {};

function getSmoothChartAnimationOptions() {
 	return {
		animation: {
			duration: 1300,
			easing: "easeOutCubic",
		},
		animations: {
			x: {
				duration: 950,
				easing: "easeOutCubic",
				from: 0,
			},
			y: {
				duration: 1300,
				easing: "easeOutQuart",
				from: (ctx) => {
					if (ctx.type === "data") {
						return 0;
					}
					return undefined;
				},
			},
		},
	};
}

function getStoredUser() {
	const raw = localStorage.getItem("kcet_user");
	return raw ? JSON.parse(raw) : null;
}

function setStoredUser(user) {
	localStorage.setItem("kcet_user", JSON.stringify(user));
}

function setStoredPrediction(predictionState) {
	localStorage.setItem(LAST_PREDICTION_STORAGE_KEY, JSON.stringify(predictionState));
}

function renderPredictionTable(predictions) {
	if (!predictions.length) {
		return "<div class='alert alert-warning'>No colleges found for your inputs.</div>";
	}

	const cards = predictions.map((item, idx) => {
		const collegeName = item.college || item.college_name || "Unknown College";
		const branch = item.branch || '-';
		const cutoffValue = item.last_year_cutoff || item.cutoff || '-';
		const chanceValue = item.chance || item.admission_chance || 'Low';
		const chanceClass = chanceValue === 'High' ? 'text-success' : chanceValue === 'Medium' ? 'text-warning' : 'text-danger';

		return `
			<article class="prediction-card panel-card" data-college="${escapeHtml(collegeName)}">
				<div class="prediction-grid">
					<div class="pred-info">
						<h5 class="pred-title">${escapeHtml(collegeName)}</h5>
						<div class="pred-meta">${escapeHtml(branch)} • Cutoff: ${escapeHtml(String(cutoffValue))}</div>
						<div class="pred-chance ${chanceClass}">${escapeHtml(chanceValue)}</div>
						<div class="pred-distance" id="distance-${idx}">Calculating distance...</div>
						<div class="pred-convenience" id="score-${idx}"></div>
						<details class="facility-accordion" open>
							<summary>Nearby facilities</summary>
							<div class="pred-facilities" id="fac-${idx}"></div>
						</details>
					</div>
					<div class="pred-map">
						<div id="miniMap-${idx}" class="mini-map"></div>
						<div class="pred-actions mt-2">
							<button class="direction-btn view-dir" data-pred-index="${idx}" data-lat="${item.latitude || ''}" data-lng="${item.longitude || ''}" aria-label="Show directions to ${escapeHtml(collegeName)}"><i class="bi bi-sign-turn-right-fill" aria-hidden="true"></i><span>Show Directions</span></button>
						</div>
					</div>
				</div>
			</article>
		`;
	}).join('');

	setTimeout(() => {
		Promise.allSettled([loadNearbyFacilities(), loadCollegesData()]).finally(() => enrichPredictionCards(predictions));
	}, 50);

	return `<div class="predictions-list">${cards}</div>`;
}

function escapeHtml(text) {
	return String(text).replace(/[&<>"'`]/g, (s) => ({
		'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;'
	}[s]));
}

function normalizeCollegeName(value) {
	return String(value || "").trim().toLowerCase();
}

function parseDistanceToKm(distanceText) {
	const value = String(distanceText || "").trim().toLowerCase();
	if (!value) {
		return null;
	}
	if (value.endsWith("km")) {
		const km = Number.parseFloat(value.replace("km", "").trim());
		return Number.isFinite(km) ? km : null;
	}
	if (value.endsWith("m")) {
		const meters = Number.parseFloat(value.replace("m", "").trim());
		return Number.isFinite(meters) ? meters / 1000 : null;
	}
	return null;
}

async function loadNearbyFacilities() {
	if (Object.keys(facilitiesByCollege).length) {
		return facilitiesByCollege;
	}

	const response = await fetch(FACILITIES_API_URL, { cache: "no-store" });
	if (!response.ok) {
		throw new Error("Failed to load nearby facilities.");
	}

	const data = await response.json();
	const source = data?.facilities || {};
	facilitiesByCollege = Object.fromEntries(
		Object.entries(source).map(([key, value]) => [normalizeCollegeName(key), value])
	);
	return facilitiesByCollege;
}

async function ensureUserLocation() {
	if (userLocation) {
		return userLocation;
	}

	try {
		userLocation = await getUserLocation();
		return userLocation;
	} catch (_error) {
		if (!locationErrorShown) {
			showToast("Using Bangalore as a fallback for directions.");
			locationErrorShown = true;
		}
		userLocation = { lat: DEFAULT_USER_LOCATION.lat, lng: DEFAULT_USER_LOCATION.lng };
		return userLocation;
	}
}

function getFacilityDataForCollege(name) {
	const normalized = normalizeCollegeName(name);
	return facilitiesByCollege[normalized] || null;
}

function generateSampleContactNumber() {
	// Generate a random 10-digit phone number for demo
	const areaCode = String(Math.floor(Math.random() * 900) + 100);
	const exchange = String(Math.floor(Math.random() * 900) + 100);
	const line = String(Math.floor(Math.random() * 9000) + 1000);
	return `${areaCode}${exchange}${line}`;
}

function renderFacilityGroup(icon, label, items) {
	if (!Array.isArray(items) || !items.length) {
		return "";
	}

	const list = items
		.slice(0, 3)
		.map((entry) => {
			const contactNumber = generateSampleContactNumber();
			const formattedPhone = `+91${contactNumber.slice(-10)}`;
			return `<li>
				<div class="facility-item-info">
					<span class="facility-name">${escapeHtml(entry.name || "Unknown")}</span>
					<span class="facility-distance">${escapeHtml(entry.distance || "N/A")}</span>
				</div>
				<a href="tel:${formattedPhone}" class="facility-contact-link" title="Call ${escapeHtml(entry.name || 'facility')}">${formattedPhone}</a>
			</li>`;
		})
		.join("");

	return `
		<div class="facility-group">
			<div class="facility-title">${icon} ${label}</div>
			<ul>${list}</ul>
		</div>
	`;
}

function computeConvenienceScore(facilities) {
	if (!facilities || typeof facilities !== "object") {
		return null;
	}

	const weights = {
		pgs: 2.2,
		metro: 2.2,
		food: 1.8,
		hospital: 2.0,
		bus: 1.8,
	};

	let weightedSum = 0;
	let maxWeighted = 0;
	Object.entries(weights).forEach(([key, weight]) => {
		const entries = Array.isArray(facilities[key]) ? facilities[key] : [];
		maxWeighted += weight;
		if (!entries.length) {
			return;
		}

		const nearest = entries
			.map((entry) => parseDistanceToKm(entry.distance))
			.filter((distance) => Number.isFinite(distance))
			.sort((a, b) => a - b)[0];

		const proximityFactor = Number.isFinite(nearest)
			? Math.max(0.35, 1 - Math.min(nearest, 5) / 6)
			: 0.62;
		weightedSum += weight * proximityFactor;
	});

	if (!maxWeighted) {
		return null;
	}

	const score = (weightedSum / maxWeighted) * 10;
	return Math.max(0, Math.min(10, score));
}

function enrichPredictionCards(predictions) {
	predictions.forEach((item, idx) => {
		const name = item.college || item.college_name;
		const col = findCollegeByName(name);
		const coords = getCoordinatesForCollege(item, col);
		const directionButton = document.querySelector(`.view-dir[data-pred-index="${idx}"]`);
		if (directionButton && coords) {
			directionButton.dataset.lat = String(coords.lat);
			directionButton.dataset.lng = String(coords.lng);
		}
		// distance
		computeAndShowDistance(idx, col, item);
		// facilities
		showFacilities(idx, name);
		// mini map
		initMiniMap(idx, col || item);
	});

	// Wire up directions buttons
	document.querySelectorAll('.view-dir').forEach((btn) => {
		btn.addEventListener('click', async () => {
			const lat = btn.dataset.lat;
			const lng = btn.dataset.lng;
			if (!lat || !lng) {
				showToast('Coordinates not available for this college.');
				return;
			}
			const origin = await ensureUserLocation();
			const url = `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${lat},${lng}&travelmode=driving`;
			window.location.href = url;
		});
	});
}

function findCollegeByName(name) {
	if (!name || !collegesData.length) return null;
	const normalized = normalizeCollegeName(name);
	return collegesData.find((c) => normalizeCollegeName(c.name || c.college_name) === normalized)
		|| collegesData.find((c) => normalizeCollegeName(c.name || c.college_name).includes(normalized));
}

function getCoordinatesForCollege(item, college) {
	const lat = Number(item.latitude || item.lat || college?.latitude || college?.lat);
	const lng = Number(item.longitude || item.lng || college?.longitude || college?.lng);
	if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
		return null;
	}
	return { lat, lng };
}

function computeAndShowDistance(idx, college, item) {
	const el = document.getElementById(`distance-${idx}`);
	if (!el) return;

	const coords = getCoordinatesForCollege(item, college);
	if (!coords) {
		el.textContent = 'Distance: N/A';
		return;
	}

	ensureUserLocation().then((origin) => {
		const d = haversineDistance(origin.lat, origin.lng, coords.lat, coords.lng);
		el.textContent = `${d.toFixed(1)} km away`;
	});
}

function showFacilities(idx, collegeName) {
	const container = document.getElementById(`fac-${idx}`);
	const scoreEl = document.getElementById(`score-${idx}`);
	if (!container) return;
	const facilities = getFacilityDataForCollege(collegeName);
	if (!facilities) {
		container.innerHTML = '<div class="facility-empty">Nearby facilities data not available</div>';
		if (scoreEl) {
			scoreEl.textContent = "Convenience Score: N/A";
		}
		return;
	}

	const html = [
		renderFacilityGroup("🏠", "PGs Nearby", facilities.pgs),
		renderFacilityGroup("🚇", "Metro", facilities.metro),
		renderFacilityGroup("🚌", "Bus Stops", facilities.bus),
		renderFacilityGroup("🍔", "Food", facilities.food),
		renderFacilityGroup("🏥", "Hospitals", facilities.hospital),
	].filter(Boolean).join("");

	container.innerHTML = html || '<div class="facility-empty">Nearby facilities data not available</div>';

	const score = computeConvenienceScore(facilities);
	if (scoreEl) {
		scoreEl.textContent = Number.isFinite(score) ? `Convenience Score: ${score.toFixed(1)}/10` : "Convenience Score: N/A";
	}
}

function initMiniMap(idx, college) {
	const containerId = `miniMap-${idx}`;
	const el = document.getElementById(containerId);
	if (!el) return;
	// clear previous if any
	el.innerHTML = '';
	const lat = college && (college.latitude || college.lat || college.lat);
	const lng = college && (college.longitude || college.lng || college.lon || college.long);
	const map = L.map(containerId, { attributionControl: false, zoomControl: false }).setView([lat || 12.9716, lng || 77.5946], lat && lng ? 13 : 6);
	L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
	if (lat && lng) {
		const m = L.marker([lat, lng]).addTo(map);
		map.setView([lat, lng], 13);
	}
}

function loadCollegesData() {
	return fetch('/data/colleges.json').then(r => r.json()).then(j => { collegesData = j.colleges || []; return collegesData; });
}

function initDashboardMap() {
	if (dashboardMap) return dashboardMap;
	const el = document.getElementById('dashboardMap');
	if (!el || typeof L === 'undefined') return null;
	// Center roughly on Karnataka
	const center = [13.0, 75.5];
	dashboardMap = L.map('dashboardMap', { minZoom: 6 }).setView(center, 7);
	L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(dashboardMap);
	dashboardMarkerLayer = L.layerGroup().addTo(dashboardMap);
	// load data and add markers
	loadCollegesData().then(() => addMarkersToDashboard(collegesData));
	return dashboardMap;
}

function addMarkersToDashboard(list) {
	if (!dashboardMarkerLayer) dashboardMarkerLayer = L.layerGroup().addTo(dashboardMap);
	dashboardMarkerLayer.clearLayers();
	list.forEach(c => {
		if (!c.latitude || !c.longitude) return;
		const icon = L.divIcon({ className: 'custom-marker', html: '<div class="marker-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
		const m = L.marker([c.latitude, c.longitude], { icon }).addTo(dashboardMarkerLayer);
		const popupHtml = `
			<div style="min-width:200px">
			  <strong>${escapeHtml(c.name)}</strong>
			  <div style="font-size:13px;color:#55607d;margin-top:6px">${escapeHtml(c.description || '')}</div>
			  <div style="margin-top:8px;font-size:13px">Branches: ${escapeHtml((c.branches||[]).join(', '))}</div>
			  <div style="margin-top:4px;font-size:13px">Last cutoff: ${escapeHtml(String(c.last_year_cutoff || c.last_year_cutoff || '-'))}</div>
			</div>
		`;
		m.bindPopup(popupHtml);
		m.on('mouseover', () => m.openPopup());
		m.on('mouseout', () => m.closePopup());
	});
}

function highlightMarkersForPredictions(predictions) {
	if (!dashboardMarkerLayer || !predictions) return;
	// open popup for matches and pan map lightly
	predictions.forEach(p => {
		const match = findCollegeByName(p.college || p.college_name);
		if (match) {
			const lat = match.latitude, lng = match.longitude;
			dashboardMap.panTo([lat, lng]);
			// find marker and open popup
			dashboardMarkerLayer.eachLayer(layer => {
				if (layer.getLatLng && layer.getLatLng().lat === lat && layer.getLatLng().lng === lng) {
					layer.openPopup();
				}
			});
		}
	});
}

function haversineDistance(lat1, lon1, lat2, lon2) {
	const toRad = (v) => v * Math.PI / 180;
	const R = 6371; // km
	const dLat = toRad(lat2 - lat1);
	const dLon = toRad(lon2 - lon1);
	const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
	return R * c;
}

function getUserLocation() {
	return new Promise((resolve, reject) => {
		if (!navigator.geolocation) return reject('geolocation-unavailable');
		navigator.geolocation.getCurrentPosition((pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }), (err) => reject(err), { timeout: 8000 });
	});
}

function renderAIPredictorPanel(apiData, requestPayload) {
	const panel = document.getElementById("aiPredictorResult");
	const badge = document.getElementById("aiSuitabilityBadge");
	const summary = document.getElementById("aiSuitabilityText");
	const suggestionList = document.getElementById("aiSuggestionList");
	const branchList = document.getElementById("aiBranchList");

	if (!panel || !badge || !summary || !suggestionList || !branchList) {
		return;
	}

	const predictions = apiData.predictions || apiData.predicted_colleges || [];
	const topPrediction = predictions[0] || {};
	const chance = String(topPrediction.chance || topPrediction.admission_chance || "Low");
	const confidence = Number(apiData.model_prediction?.confidence || topPrediction.confidence || 0);
	const recommendations = apiData.recommendations || {};

	let suitability = "Needs Improvement";
	let suitabilityClass = "warn";
	if (chance === "High" && confidence >= 0.65) {
		suitability = "Strongly Suitable";
		suitabilityClass = "good";
	} else if ((chance === "Medium" && confidence >= 0.45) || chance === "High") {
		suitability = "Moderately Suitable";
		suitabilityClass = "mid";
	}

	badge.className = `ai-suitability-badge ${suitabilityClass}`;
	badge.textContent = suitability;

	const predictedCollege = apiData.model_prediction?.college || topPrediction.college || "your selected option";
	summary.textContent = `AI estimates that ${predictedCollege} for ${requestPayload.preferred_branch} in ${requestPayload.category} category is ${chance.toLowerCase()} chance with confidence ${Math.round(confidence * 100)}%.`;

	const topColleges = (recommendations.best_colleges || []).slice(0, 3);
	const fallbackSuggestions = [
		`Target branch focus: ${requestPayload.preferred_branch}`,
		"Attempt 2 timed mocks per week and track incorrect topics.",
		"Prioritize chapters with repeated mistakes before new topics.",
	];

	if (topColleges.length) {
		suggestionList.innerHTML = topColleges
			.map((row) => `<div class="ai-list-item">${row.college} (${row.branch}) - fit score ${Math.round(Number(row.score || 0) * 100)}%</div>`)
			.join("");
	} else {
		suggestionList.innerHTML = fallbackSuggestions
			.map((line) => `<div class="ai-list-item">${line}</div>`)
			.join("");
	}

	const topBranches = (recommendations.best_branches || []).slice(0, 3);
	if (topBranches.length) {
		branchList.innerHTML = topBranches
			.map((row) => `<div class="ai-list-item">${row.branch} - recommendation strength ${Math.round(Number(row.score || 0) * 100)}%</div>`)
			.join("");
	} else {
		branchList.innerHTML = `<div class="ai-list-item">No branch suggestions available yet. Try again after more mock scores.</div>`;
	}

	panel.classList.remove("hidden");
}

function renderAIPredictorPlaceholder() {
	const panel = document.getElementById("aiPredictorResult");
	const badge = document.getElementById("aiSuitabilityBadge");
	const summary = document.getElementById("aiSuitabilityText");
	const suggestionList = document.getElementById("aiSuggestionList");
	const branchList = document.getElementById("aiBranchList");

	if (!panel || !badge || !summary || !suggestionList || !branchList) {
		return;
	}

	badge.className = "ai-suitability-badge mid";
	badge.textContent = "Waiting for Analysis";
	summary.textContent = "Enter rank, category, and branch, then click Predict Colleges to get AI suitability analysis and personalized suggestions.";

	suggestionList.innerHTML = [
		"Add your KCET rank and preferred branch to start AI analysis.",
		"After prediction, AI will show top-fit colleges and action steps.",
		"You can rerun prediction with different branches for better fit comparison.",
	]
		.map((line) => `<div class="ai-list-item">${line}</div>`)
		.join("");

	branchList.innerHTML = [
		"Branch suggestions will appear after your first prediction.",
		"AI uses confidence + admission chance + recommendation score.",
	]
		.map((line) => `<div class="ai-list-item">${line}</div>`)
		.join("");

	panel.classList.remove("hidden");
}

async function handleSignup(event) {
	event.preventDefault();
	const status = document.getElementById("signupStatus");

	const payload = {
		name: document.getElementById("signupName").value.trim(),
		email: document.getElementById("signupEmail").value.trim(),
		password: document.getElementById("signupPassword").value,
	};

	const response = await fetch(`${API_BASE_URL}/users`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	});
	const data = await response.json();

	if (!response.ok) {
		status.innerHTML = `<div class="alert alert-danger">${data.error || "Signup failed"}</div>`;
		return;
	}

	setStoredUser(data.user);
	status.innerHTML = "<div class='alert alert-success'>Account created. Redirecting to dashboard...</div>";
	setTimeout(() => {
		window.location.href = "/dashboard";
	}, 700);
}

async function handleLogin(event) {
	event.preventDefault();
	const status = document.getElementById("loginStatus");

	const payload = {
		email: document.getElementById("loginEmail").value.trim(),
		password: document.getElementById("loginPassword").value,
	};

	const response = await fetch(`${API_BASE_URL}/auth/login`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	});
	const data = await response.json();

	if (!response.ok) {
		status.innerHTML = `<div class="alert alert-danger">${data.error || "Login failed"}</div>`;
		return;
	}

	setStoredUser(data.user);
	status.innerHTML = "<div class='alert alert-success'>Login successful. Redirecting...</div>";
	setTimeout(() => {
		window.location.href = "/dashboard";
	}, 700);
}

async function handlePredict(event) {
	event.preventDefault();

	const user = getStoredUser();
	const result = document.getElementById("result");
	const status = document.getElementById("predictStatus");

	const payload = {
		rank: Number(document.getElementById("rankInput").value),
		category: document.getElementById("categoryInput").value,
		preferred_branch: document.getElementById("branchInput").value,
	};

	const preferredCollegeInput = document.getElementById("collegeInput");
	const preferredCollege = preferredCollegeInput ? preferredCollegeInput.value.trim() : "";
	if (preferredCollege) {
		payload.preferred_college = preferredCollege;
	}

	if (user && user.id) {
		payload.user_id = user.id;
	}

	const response = await fetch(`${API_BASE_URL}/predict`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	});
	const data = await response.json();

	if (!response.ok) {
		status.innerHTML = `<div class="alert alert-danger">${data.error || "Prediction failed"}</div>`;
		result.innerHTML = "";
		renderAIPredictorPlaceholder();
		return;
	}

	const saveText = data.saved_prediction_id
		? `Prediction saved with ID ${data.saved_prediction_id}.`
		: "Prediction generated (not linked to a user).";
	status.innerHTML = `<div class="alert alert-info">${saveText}</div>`;
	const renderedPredictions = data.predictions || data.predicted_colleges || [];
	result.innerHTML = renderPredictionTable(renderedPredictions);

	// ensure dashboard map exists and highlight markers for these results
	try {
		initDashboardMap();
		highlightMarkersForPredictions(renderedPredictions);
	} catch (e) {
		// ignore map errors
	}
	renderAIPredictorPanel(data, payload);

	setStoredPrediction({
		createdAt: new Date().toISOString(),
		request: payload,
		response: data,
	});
}

async function renderCutoffChart() {
	const canvas = document.getElementById("cutoffChart");
	if (!canvas) {
		return;
	}

	let response;
	let data;
	try {
		response = await fetch(`${API_BASE_URL}/cutoff-trends?category=GM`);
		data = await response.json();
	} catch (_error) {
		return;
	}

	if (!response.ok) {
		return;
	}

	if (typeof Chart === "undefined") {
		return;
	}

	const labels = data.years || [];
	const chartContext = canvas.getContext("2d");
	const lineColors = ["#0d6efd", "#198754", "#dc3545", "#fd7e14"];
	const fillColors = ["rgba(13, 110, 253, 0.16)", "rgba(25, 135, 84, 0.16)", "rgba(220, 53, 69, 0.16)", "rgba(253, 126, 20, 0.16)"];
	const datasets = (data.trends || []).slice(0, 4).map((trend, index) => {
		return {
			label: `${trend.college_name} (${trend.branch})`,
			data: trend.cutoffs,
			borderColor: lineColors[index % lineColors.length],
			backgroundColor: fillColors[index % fillColors.length],
			pointBackgroundColor: lineColors[index % lineColors.length],
			pointBorderColor: "#ffffff",
			pointBorderWidth: 2,
			pointRadius: 4,
			pointHoverRadius: 7,
			borderWidth: 3.5,
			fill: true,
			tension: 0.42,
		};
	});

	if (cutoffChartInstance) {
		cutoffChartInstance.destroy();
	}

	cutoffChartInstance = new Chart(canvas, {
		type: "line",
		data: { labels, datasets },
		options: {
			...getSmoothChartAnimationOptions(),
			animation: {
				duration: 2000,
				easing: "easeOutQuart",
			},
			animations: {
				x: {
					duration: 1200,
					easing: "easeOutCubic",
					from: 0,
					delay: (ctx) => {
						if (ctx.type === "data") {
							return ctx.dataIndex * 130;
						}
						return 0;
					},
				},
				y: {
					duration: 1500,
					easing: "easeOutQuart",
					from: 0,
					delay: (ctx) => {
						if (ctx.type === "data") {
							return ctx.dataIndex * 130;
						}
						return 0;
					},
				},
			},
			responsive: true,
			plugins: {
				legend: {
					position: "bottom",
					labels: {
						usePointStyle: true,
						boxWidth: 10,
						padding: 18,
					},
				},
				title: {
					display: false,
				},
				tooltip: {
					backgroundColor: "rgba(18, 28, 55, 0.94)",
					padding: 12,
					usePointStyle: true,
				},
			},
			scales: {
				y: {
					beginAtZero: true,
					grid: { color: "rgba(17, 27, 54, 0.08)" },
					ticks: { color: "#62708f" },
				},
				x: {
					grid: { color: "rgba(17, 27, 54, 0.06)" },
					ticks: { color: "#62708f" },
				},
			},
			elements: {
				line: {
					borderJoinStyle: "round",
				},
			},
		},
	});
}

function clampScore(value) {
	const numeric = Number(value);
	if (!Number.isFinite(numeric)) {
		return 0;
	}
	return Math.max(0, Math.min(100, Math.round(numeric)));
}

function getDefaultSubjectScores() {
	return {
		Maths: 72,
		Physics: 66,
		Chemistry: 78,
		Biology: 58,
	};
}

function getStoredSubjectScores() {
	const raw = localStorage.getItem(SUBJECT_ANALYSIS_STORAGE_KEY);
	if (!raw) {
		return getDefaultSubjectScores();
	}

	try {
		const parsed = JSON.parse(raw);
		return {
			Maths: clampScore(parsed.Maths),
			Physics: clampScore(parsed.Physics),
			Chemistry: clampScore(parsed.Chemistry),
			Biology: clampScore(parsed.Biology),
		};
	} catch (_error) {
		return getDefaultSubjectScores();
	}
}

function setStoredSubjectScores(scores) {
	localStorage.setItem(SUBJECT_ANALYSIS_STORAGE_KEY, JSON.stringify(scores));
}

function readSubjectScoresFromInputs() {
	return {
		Maths: clampScore(document.getElementById("scoreMaths")?.value),
		Physics: clampScore(document.getElementById("scorePhysics")?.value),
		Chemistry: clampScore(document.getElementById("scoreChemistry")?.value),
		Biology: clampScore(document.getElementById("scoreBiology")?.value),
	};
}

function writeSubjectScoresToInputs(scores) {
	const fields = {
		scoreMaths: scores.Maths,
		scorePhysics: scores.Physics,
		scoreChemistry: scores.Chemistry,
		scoreBiology: scores.Biology,
	};

	Object.entries(fields).forEach(([id, value]) => {
		const input = document.getElementById(id);
		if (input) {
			input.value = value;
		}
	});
}

function renderSubjectLeaderboard(scores) {
	const container = document.getElementById("subjectLeaderboard");
	if (!container) {
		return;
	}

	const ranking = Object.entries(scores).sort((a, b) => b[1] - a[1]);
	container.innerHTML = ranking
		.map(([subject, score], index) => {
			return `
				<div class="leaderboard-item">
					<span class="rank-chip">${index + 1}</span>
					<span class="subject-name">${subject}</span>
					<span class="score-pill">${score}%</span>
				</div>
			`;
		})
		.join("");
}

function recommendationForGap(subject, gap) {
	if (gap <= 0) {
		return `<div class="insight-item good">${subject}: Strong performance. Maintain with weekly revision tests.</div>`;
	}

	if (gap >= 25) {
		return `<div class="insight-item">${subject}: High priority. Add daily concept revision + 25 MCQs for this subject.</div>`;
	}

	if (gap >= 15) {
		return `<div class="insight-item">${subject}: Medium priority. Practice alternate-day chapter tests and formula recall.</div>`;
	}

	return `<div class="insight-item">${subject}: Minor gap. Focus on time management and error reduction in mocks.</div>`;
}

function renderImprovementInsights(scores) {
	const container = document.getElementById("improvementInsights");
	if (!container) {
		return;
	}

	const byGap = Object.entries(scores)
		.map(([subject, score]) => ({ subject, gap: Math.max(0, SUBJECT_TARGET_SCORE - score) }))
		.sort((a, b) => b.gap - a.gap);

	container.innerHTML = byGap
		.map((item) => recommendationForGap(item.subject, item.gap))
		.join("");
}

function renderSubjectCharts(scores) {
	const labels = Object.keys(scores);
	const values = labels.map((label) => scores[label]);
	const gaps = values.map((score) => Math.max(0, SUBJECT_TARGET_SCORE - score));

	const scoreCanvas = document.getElementById("subjectScoreChart");
	if (scoreCanvas) {
		if (subjectScoreChartInstance) {
			subjectScoreChartInstance.destroy();
		}

		subjectScoreChartInstance = new Chart(scoreCanvas, {
			type: "bar",
			data: {
				labels,
				datasets: [
					{
						label: "Score (%)",
						data: values,
						backgroundColor: ["#4c6fff", "#f59f00", "#28a745", "#db3a6f"],
						borderRadius: 8,
					},
				],
			},
			options: {
					...getSmoothChartAnimationOptions(),
				plugins: { legend: { display: false } },
				scales: {
					y: { beginAtZero: true, max: 100 },
				},
			},
		});
	}

	const gapCanvas = document.getElementById("subjectGapChart");
	if (gapCanvas) {
		if (subjectGapChartInstance) {
			subjectGapChartInstance.destroy();
		}

		subjectGapChartInstance = new Chart(gapCanvas, {
			type: "radar",
			data: {
				labels,
				datasets: [
					{
						label: "Improvement Needed",
						data: gaps,
						backgroundColor: "rgba(242, 84, 84, 0.2)",
						borderColor: "#d23f3f",
						pointBackgroundColor: "#d23f3f",
					},
				],
			},
			options: {
					...getSmoothChartAnimationOptions(),
				scales: {
					r: {
						beginAtZero: true,
						max: 40,
					},
				},
			},
		});
	}
}

function applySubjectAnalysis(scores) {
	renderSubjectCharts(scores);
	renderSubjectLeaderboard(scores);
	renderImprovementInsights(scores);
	setStoredSubjectScores(scores);
}

function setupSubjectAnalysis() {
	const analyzeBtn = document.getElementById("analyzePerformanceBtn");
	if (!analyzeBtn) {
		return;
	}

	const resetBtn = document.getElementById("resetPerformanceBtn");
	const initialScores = getStoredSubjectScores();
	writeSubjectScoresToInputs(initialScores);
	applySubjectAnalysis(initialScores);

	analyzeBtn.addEventListener("click", () => {
		const scores = readSubjectScoresFromInputs();
		writeSubjectScoresToInputs(scores);
		applySubjectAnalysis(scores);
	});

	if (resetBtn) {
		resetBtn.addEventListener("click", () => {
			const defaults = getDefaultSubjectScores();
			writeSubjectScoresToInputs(defaults);
			applySubjectAnalysis(defaults);
		});
	}
}

function renderComparisonChart() {
	const canvas = document.getElementById("compareChart");
	if (!canvas) {
		return;
	}

	new Chart(canvas, {
		type: "bar",
		data: {
			labels: ["RVCE", "BMSCE", "PES", "MSRIT"],
			datasets: [
				{
					label: "Average Salary (LPA)",
					data: [18.5, 13.2, 16.1, 12.8],
					backgroundColor: ["#0d6efd", "#20c997", "#ffc107", "#fd7e14"],
				},
			],
		},
		options: {
			...getSmoothChartAnimationOptions(),
			plugins: { legend: { position: "bottom" } },
		},
	});
}

function setupForms() {
	const signupForm = document.getElementById("signupForm");
	if (signupForm) {
		signupForm.addEventListener("submit", handleSignup);
	}

	const loginForm = document.getElementById("loginForm");
	if (loginForm) {
		loginForm.addEventListener("submit", handleLogin);
	}

	const predictForm = document.getElementById("predictForm");
	if (predictForm) {
		predictForm.addEventListener("submit", handlePredict);
	}
}

function setupDashboard() {
	const heading = document.getElementById("dashboardWelcome");
	if (!heading) {
		return;
	}

	const user = getStoredUser();
	if (user && user.name) {
		heading.textContent = `Welcome ${user.name}`;
	}
}

function setupSidebarToggle() {
	const shell = document.querySelector(".app-shell");
	const toggleButton = document.querySelector(".sidebar-toggle");
	const sidebar = document.querySelector(".app-sidebar");
	if (!shell || !toggleButton || !sidebar) {
		return;
	}

	const closeSidebar = () => shell.classList.remove("sidebar-open");

	toggleButton.addEventListener("click", () => {
		shell.classList.toggle("sidebar-open");
	});

	document.addEventListener("click", (event) => {
		if (window.innerWidth > 900) {
			return;
		}
		if (!shell.classList.contains("sidebar-open")) {
			return;
		}
		if (sidebar.contains(event.target) || toggleButton.contains(event.target)) {
			return;
		}
		closeSidebar();
	});

	window.addEventListener("resize", () => {
		if (window.innerWidth > 900) {
			closeSidebar();
		}
	});
}

/* ----------------- Additional UI helpers ----------------- */

function animateCounters() {
	const counters = document.querySelectorAll('.stat-value[data-target]');
	counters.forEach((el) => {
		const target = Number(el.dataset.target || 0);
		let current = 0;
		const step = Math.max(1, Math.floor(target / 80));
		const tick = () => {
			current += step;
			if (current >= target) {
				el.textContent = String(target);
			} else {
				el.textContent = String(current);
				requestAnimationFrame(tick);
			}
		};
		requestAnimationFrame(tick);
	});
}

const NOTIFICATION_STORAGE_KEY = 'rr_notifications_v2';

function getOfficialNotificationCatalog() {
	return [
		{
			key: 'kcet-counseling-schedule',
			title: 'KCET Counseling Schedule',
			category: 'KCET',
			kind: 'Counseling',
			text: 'KEA has released the latest KCET counseling schedule, document verification timeline, and reporting instructions.',
			priority: 'high',
			important: true,
			offsetMs: 2 * 3600 * 1000,
		},
		{
			key: 'kcet-seat-allotment',
			title: 'KCET Seat Allotment Alert',
			category: 'KCET',
			kind: 'Seat Allotment',
			text: 'Round 1 seat allotment updates are live. Check your allotment status and the official reporting dates.',
			priority: 'high',
			important: true,
			offsetMs: 7 * 3600 * 1000,
		},
		{
			key: 'comedk-admission-update',
			title: 'COMEDK Admission Update',
			category: 'COMEDK',
			kind: 'Admission',
			text: 'COMEDK admission deadlines and option entry instructions have been updated on the official portal.',
			priority: 'high',
			important: true,
			offsetMs: 10 * 3600 * 1000,
		},
		{
			key: 'pessat-updates',
			title: 'PESSAT Notifications',
			category: 'PESSAT',
			kind: 'Exam',
			text: 'PESSAT application, exam, and slot booking notifications are available for candidates.',
			priority: 'high',
			important: false,
			offsetMs: 16 * 3600 * 1000,
		},
		{
			key: 'rvu-admissions',
			title: 'RV University Admissions',
			category: 'Admissions',
			kind: 'Admission',
			text: 'RV University admissions have opened for select programs with scholarship and counseling notices.',
			priority: 'medium',
			important: false,
			offsetMs: 24 * 3600 * 1000,
		},
		{
			key: 'bms-admissions',
			title: 'BMS Admissions Notice',
			category: 'Admissions',
			kind: 'Admission',
			text: 'BMS College admission notifications and document verification steps have been published.',
			priority: 'medium',
			important: false,
			offsetMs: 30 * 3600 * 1000,
		},
		{
			key: 'dsu-entrance-update',
			title: 'DSU Entrance Exam Update',
			category: 'DSU',
			kind: 'Exam',
			text: 'DSU entrance exam notification, syllabus, and registration timeline are now live.',
			priority: 'medium',
			important: false,
			offsetMs: 44 * 3600 * 1000,
		},
		{
			key: 'mock-test-announcement',
			title: 'Mock Test Announcement',
			category: 'Mock Test',
			kind: 'Practice',
			text: 'A new official mock test session is ready with timed practice and answer review.',
			priority: 'low',
			important: false,
			offsetMs: 60 * 3600 * 1000,
		},
		{
			key: 'counseling-reminder',
			title: 'Counseling Schedule Update',
			category: 'Counseling',
			kind: 'Counseling',
			text: 'Keep your documents ready for the next counseling window and fee payment milestone.',
			priority: 'medium',
			important: false,
			offsetMs: 18 * 3600 * 1000,
		},
		{
			key: 'comedk-seat-allotment',
			title: 'COMEDK Seat Allotment Alert',
			category: 'Seat Allotment',
			kind: 'Seat Allotment',
			text: 'COMEDK seat allotment round details are now available for applicants.',
			priority: 'high',
			important: true,
			offsetMs: 20 * 3600 * 1000,
		},
	];
}

function loadNotificationState() {
	const raw = localStorage.getItem(NOTIFICATION_STORAGE_KEY);
	const parsed = raw ? JSON.parse(raw) : null;
	return Array.isArray(parsed) ? parsed : [];
}

function saveNotificationState(items) {
	localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(items));
}

function syncNotificationState() {
	const now = Date.now();
	const source = loadNotificationState();
	const catalog = getOfficialNotificationCatalog();
	const synced = catalog.map((item, index) => {
		const match = source.find((entry) => String(entry?.key || entry?.title || '').trim().toLowerCase() === item.key.toLowerCase());
		if (match) {
			return {
				...match,
				key: item.key,
				title: item.title,
				category: item.category,
				kind: item.kind,
				text: item.text,
				priority: item.priority,
				important: Boolean(item.important),
				read: Boolean(match.read),
				datetime: match.datetime || new Date(now - item.offsetMs).toISOString(),
			};
		}
		return {
			id: `notif-${index + 1}`,
			key: item.key,
			title: item.title,
			category: item.category,
			kind: item.kind,
			text: item.text,
			priority: item.priority,
			important: Boolean(item.important),
			read: false,
			datetime: new Date(now - item.offsetMs).toISOString(),
		};
	}).sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime());
	saveNotificationState(synced);
	return synced;
}

function getNotificationRelativeTime(iso) {
	if (!iso) return '';
	const elapsed = Math.max(0, Date.now() - new Date(iso).getTime());
	const minutes = Math.floor(elapsed / 60000);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

function getNotificationFilterItems(notifications) {
	const categories = Array.from(new Set(notifications.map((item) => item.category).filter(Boolean)));
	return ['all', 'unread', 'important', ...categories];
}

function setupNotifications() {
	const bell = document.getElementById('notifBell');
	const badge = document.getElementById('notifBadge');
	const previewList = document.getElementById('notifPreviewList');
	const listEl = document.getElementById('notificationsList');
	const filtersEl = document.getElementById('notificationsFilters');
	const markAllBtn = document.getElementById('markAllNotifications');
	const unreadCountEl = document.getElementById('notificationsUnreadCount');
	const unreadHeroEl = document.getElementById('notificationsUnreadHero');
	const totalCountEl = document.getElementById('notificationsTotalCount');
	const importantCountEl = document.getElementById('notificationsImportantCount');
	const emptyEl = document.getElementById('notificationsEmpty');
	const pageIsActive = Boolean(listEl || filtersEl || markAllBtn || unreadCountEl || totalCountEl);
	const previewIsActive = Boolean(previewList || badge || bell);
	if (!pageIsActive && !previewIsActive) return;

	let activeFilter = 'all';
	let notifications = syncNotificationState();

	function getVisibleNotifications() {
		if (activeFilter === 'all') return notifications;
		if (activeFilter === 'unread') return notifications.filter((item) => !item.read);
		if (activeFilter === 'important') return notifications.filter((item) => item.important);
		return notifications.filter((item) => item.category === activeFilter);
	}

	function updateCounts() {
		const unreadCount = notifications.filter((item) => !item.read).length;
		const importantCount = notifications.filter((item) => item.important).length;
		if (badge) {
			if (unreadCount > 0) {
				badge.textContent = String(unreadCount);
				badge.style.display = 'inline-flex';
			} else {
				badge.style.display = 'none';
			}
		}
		if (unreadCountEl) unreadCountEl.textContent = String(unreadCount);
		if (unreadHeroEl) unreadHeroEl.textContent = String(unreadCount);
		if (totalCountEl) totalCountEl.textContent = String(notifications.length);
		if (importantCountEl) importantCountEl.textContent = String(importantCount);
	}

	function renderPreview() {
		if (!previewList) return;
		const previewItems = notifications.slice(0, 3);
		if (!previewItems.length) {
			previewList.innerHTML = '<div class="notif-preview-empty">No official notifications yet.</div>';
			return;
		}
		previewList.innerHTML = previewItems.map((item) => {
			const previewClass = item.read ? 'is-read' : 'is-unread';
			return `
				<a class="notif-preview-item ${previewClass}" href="/notifications" data-preview-id="${escapeHtml(String(item.id || item.key))}">
					<div class="notif-preview-main">
						<div class="notif-preview-topline">
							<span class="notif-category-pill">${escapeHtml(item.category)}</span>
							<span class="notif-preview-time">${escapeHtml(getNotificationRelativeTime(item.datetime))}</span>
						</div>
						<div class="notif-preview-title">${escapeHtml(item.title)}</div>
						<div class="notif-preview-text">${escapeHtml(item.text)}</div>
					</div>
					<span class="notif-status-dot ${item.read ? 'is-read' : 'is-unread'}" aria-hidden="true"></span>
				</a>
			`;
		}).join('');
	}

	function renderFilters() {
		if (!filtersEl) return;
		const filterItems = getNotificationFilterItems(notifications);
		filtersEl.innerHTML = filterItems.map((filter) => {
			const label = filter === 'all' ? 'All' : filter === 'unread' ? 'Unread' : filter === 'important' ? 'Important' : filter;
			return `<button class="notification-filter ${activeFilter === filter ? 'active' : ''}" type="button" data-filter="${escapeHtml(filter)}">${escapeHtml(label)}</button>`;
		}).join('');
	}

	function renderPageList() {
		if (!listEl) return;
		const visibleNotifications = getVisibleNotifications();
		if (!visibleNotifications.length) {
			listEl.innerHTML = '';
			if (emptyEl) emptyEl.hidden = false;
			return;
		}
		if (emptyEl) emptyEl.hidden = true;
		listEl.innerHTML = visibleNotifications.map((item) => {
			const timeLabel = getNotificationRelativeTime(item.datetime);
			const statusLabel = item.read ? 'Read' : 'Unread';
			return `
				<article class="notification-card ${item.read ? '' : 'is-unread'} ${item.important ? 'is-important' : ''}" data-notification-id="${escapeHtml(String(item.id || item.key))}">
					<div class="notification-card-accent"></div>
					<div class="notification-card-body">
						<div class="notification-card-head">
							<div class="notification-card-meta">
								<span class="notification-badge category">${escapeHtml(item.category)}</span>
								<span class="notification-badge kind">${escapeHtml(item.kind)}</span>
								${item.important ? '<span class="notification-badge important">Important</span>' : ''}
							</div>
							<span class="notification-state ${item.read ? 'read' : 'unread'}">${statusLabel}</span>
						</div>
						<h3 class="notification-card-title">${escapeHtml(item.title)}</h3>
						<p class="notification-card-text">${escapeHtml(item.text)}</p>
						<div class="notification-card-footer">
							<div class="notification-card-time"><i class="bi bi-clock"></i>${escapeHtml(timeLabel)}</div>
							<div class="notification-card-actions">
								<button class="btn btn-sm btn-outline-light mark-single-btn" type="button">${item.read ? 'Seen' : 'Mark as read'}</button>
							</div>
						</div>
					</div>
				</article>
			`;
		}).join('');
	}

	function rerender() {
		notifications = syncNotificationState();
		updateCounts();
		renderPreview();
		renderFilters();
		renderPageList();
	}

	function setActiveFilter(filter) {
		activeFilter = filter;
		renderFilters();
		renderPageList();
	}

	function markNotificationRead(identifier) {
		notifications = notifications.map((item) => {
			const itemId = String(item.id || item.key);
			return itemId === String(identifier) ? { ...item, read: true } : item;
		});
		saveNotificationState(notifications);
		renderPreview();
		updateCounts();
		renderPageList();
	}

	function markAllRead() {
		notifications = notifications.map((item) => ({ ...item, read: true }));
		saveNotificationState(notifications);
		renderPreview();
		updateCounts();
		renderPageList();
	}

	if (bell) {
		bell.addEventListener('click', (event) => {
			event.preventDefault();
			window.location.href = '/notifications';
		});
	}

	if (filtersEl) {
		filtersEl.addEventListener('click', (event) => {
			const button = event.target.closest('[data-filter]');
			if (!button) return;
			setActiveFilter(button.dataset.filter || 'all');
		});
	}

	if (listEl) {
		listEl.addEventListener('click', (event) => {
			const card = event.target.closest('.notification-card');
			if (!card) return;
			const identifier = card.dataset.notificationId;
			const markBtn = event.target.closest('.mark-single-btn');
			if (markBtn) {
				event.stopPropagation();
				markNotificationRead(identifier);
				return;
			}
			markNotificationRead(identifier);
		});
	}

	if (markAllBtn) {
		markAllBtn.addEventListener('click', markAllRead);
	}

	rerender();
}

function showToast(message = '', timeout = 2200) {
	const t = document.createElement('div');
	t.className = 'rr-toast';
	t.textContent = message;
	Object.assign(t.style, { position: 'fixed', right: '18px', bottom: '18px', background: '#0d1738', color:'#fff', padding:'10px 14px', borderRadius:'10px', boxShadow:'0 12px 30px rgba(4,12,40,0.4)', zIndex:9999 });
	document.body.appendChild(t);
	setTimeout(() => t.style.opacity = '0.01', timeout - 300);
	setTimeout(() => t.remove(), timeout);
}

function setupExamButtons() {
	document.querySelectorAll('.apply-btn').forEach((btn) => {
		btn.addEventListener('click', (e) => {
			const card = btn.closest('.exam-card');
			const exam = card?.dataset?.exam || 'exam';
			// open apply page — placeholder
			window.location.href = '/predictor';
			showToast(`Opening application page for ${exam}`);
		});
	});

	document.querySelectorAll('.remind-btn').forEach((btn) => {
		btn.addEventListener('click', (e) => {
			const card = btn.closest('.exam-card');
			const exam = card?.dataset?.exam || 'exam';
			showToast(`Reminder set for ${exam}`);
		});
	});
}

function setupThemeToggle() {
	const toggle = document.getElementById('themeToggle');
	if (!toggle) return;
	const apply = (mode) => {
		if (mode === 'dark') document.documentElement.classList.add('dark'); else document.documentElement.classList.remove('dark');
		localStorage.setItem('rankroute_theme', mode);
		toggle.innerHTML = mode === 'dark' ? '<i class="bi bi-sun"></i>' : '<i class="bi bi-moon-stars"></i>';
	};
	const stored = localStorage.getItem('rankroute_theme') || 'light';
	apply(stored);
	toggle.addEventListener('click', () => {
		const cur = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
		apply(cur === 'dark' ? 'light' : 'dark');
	});
}

function setupButtonRipples() {
	document.addEventListener('click', (ev) => {
		const btn = ev.target.closest('.btn');
		if (!btn) return;
		const rect = btn.getBoundingClientRect();
		const ripple = document.createElement('span');
		ripple.className = 'ripple';
		Object.assign(ripple.style, { left: (ev.clientX - rect.left) + 'px', top: (ev.clientY - rect.top) + 'px' });
		btn.appendChild(ripple);
		setTimeout(() => ripple.remove(), 600);
	});
}

/* ----------------- Scroll animations (IntersectionObserver) ----------------- */
function setupScrollAnimations() {
	const observer = new IntersectionObserver((entries) => {
		entries.forEach((entry) => {
			if (entry.isIntersecting) {
				entry.target.classList.add('in-view');
				// trigger counters when stats grid is visible
				if (entry.target.closest && entry.target.closest('.stats-grid')) {
					animateCounters();
				}
				observer.unobserve(entry.target);
			}
		});
	}, { threshold: 0.12 });

	document.querySelectorAll('.panel-card, .stat-item, .phrase-card, .exam-card, .resource-card, .prediction-card, .dashboard-chart-card').forEach((el) => {
		el.classList.add('fade-in');
		observer.observe(el);
	});
}

/* ----------------- Initialization ----------------- */
document.addEventListener("DOMContentLoaded", () => {
	setupForms();
	setupDashboard();
	setupSidebarToggle();
	renderComparisonChart();
	renderCutoffChart();
	setupSubjectAnalysis();
	renderAIPredictorPlaceholder();
	// counters will run when stats enter viewport; call once immediately for desktop
	animateCounters();
	setupNotifications();
	setupExamButtons();
	setupThemeToggle();
	setupButtonRipples();
	setupScrollAnimations();

	// initialize dashboard map if present
	try { initDashboardMap(); } catch (e) { /* ignore if leaflet missing */ }

	// map / explore buttons
	document.getElementById('exploreMapBtn')?.addEventListener('click', () => window.location.href = '/map');
	document.getElementById('openMapBtn')?.addEventListener('click', () => window.location.href = '/map');
});
