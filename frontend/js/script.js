const API_BASE_URL = "http://127.0.0.1:5000";
const SUBJECT_ANALYSIS_STORAGE_KEY = "kcet_subject_scores";
const SUBJECT_TARGET_SCORE = 85;
const LAST_PREDICTION_STORAGE_KEY = "rankroute_last_prediction";

let subjectScoreChartInstance = null;
let subjectGapChartInstance = null;
let cutoffChartInstance = null;
let dashboardMap = null;
let dashboardMarkerLayer = null;
let collegesData = [];
let userLocation = null; // {lat, lng}

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

	// Build card-based UI for predictions
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
						<div class="pred-facilities" id="fac-${idx}"></div>
					</div>
					<div class="pred-map">
						<div id="miniMap-${idx}" class="mini-map"></div>
						<div class="pred-actions mt-2">
							<button class="btn btn-sm btn-outline-primary view-dir" data-lat="${item.latitude || ''}" data-lng="${item.longitude || ''}">View Directions</button>
						</div>
					</div>
				</div>
			</article>
		`;
	}).join('');

	// After rendering, initialize mini-maps and distance calculations
	setTimeout(() => {
		// ensure collegesData loaded
		if (!collegesData.length) {
			loadCollegesData().then(() => {
				enrichPredictionCards(predictions);
			}).catch(() => enrichPredictionCards(predictions));
		} else {
			enrichPredictionCards(predictions);
		}
	}, 50);

	return `<div class="predictions-list">${cards}</div>`;
}

function escapeHtml(text) {
	return String(text).replace(/[&<>"'`]/g, (s) => ({
		'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;'
	}[s]));
}

function enrichPredictionCards(predictions) {
	predictions.forEach((item, idx) => {
		const name = item.college || item.college_name;
		const col = findCollegeByName(name);
		// distance
		computeAndShowDistance(idx, col, item);
		// facilities
		showFacilities(idx, col);
		// mini map
		initMiniMap(idx, col || item);
	});

	// Wire up directions buttons
	document.querySelectorAll('.view-dir').forEach((btn) => {
		btn.addEventListener('click', (e) => {
			const lat = btn.dataset.lat;
			const lng = btn.dataset.lng;
			if (!lat || !lng) {
				showToast('Coordinates not available for this college');
				return;
			}
			const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
			window.open(url, '_blank');
		});
	});
}

function findCollegeByName(name) {
	if (!name || !collegesData.length) return null;
	return collegesData.find(c => (c.name || c.college_name || '').toLowerCase().includes(String(name).toLowerCase()));
}

function computeAndShowDistance(idx, college, item) {
	const el = document.getElementById(`distance-${idx}`);
	if (!el) return;
	if (!userLocation) {
		getUserLocation().then((loc) => {
			userLocation = loc;
			computeAndShowDistance(idx, college, item);
		}).catch(() => {
			userLocation = { lat: 12.9715987, lng: 77.5945627 }; // Bangalore fallback
			computeAndShowDistance(idx, college, item);
		});
		return;
	}

	const lat = (item.latitude || (college && college.latitude)) || null;
	const lng = (item.longitude || (college && college.longitude)) || null;
	if (!lat || !lng) {
		el.textContent = 'Distance: N/A';
		return;
	}
	const d = haversineDistance(userLocation.lat, userLocation.lng, Number(lat), Number(lng));
	el.textContent = `${d.toFixed(1)} km away from your location`;
}

function showFacilities(idx, college) {
	const container = document.getElementById(`fac-${idx}`);
	if (!container) return;
	if (!college || !college.nearby) {
		container.innerHTML = '<small class="text-muted">No nearby facilities data</small>';
		return;
	}
	const nearby = college.nearby;
	const icons = [];
	if (nearby.malls && nearby.malls.length) icons.push(`<span title="Malls">🛍️ ${nearby.malls[0]}</span>`);
	if (nearby.bus_stops && nearby.bus_stops.length) icons.push(`<span title="Bus stop">🚌 ${nearby.bus_stops[0]}</span>`);
	if (nearby.metro && nearby.metro.length) icons.push(`<span title="Metro">🚇 ${nearby.metro[0]}</span>`);
	if (nearby.hospitals && nearby.hospitals.length) icons.push(`<span title="Hospital">🏥 ${nearby.hospitals[0]}</span>`);
	container.innerHTML = icons.join(' • ');
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
		window.location.href = "/html/dashboard.html";
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
		window.location.href = "/html/dashboard.html";
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

function setupNotifications() {
	const bell = document.getElementById('notifBell');
	const badge = document.getElementById('notifBadge');
	if (!bell) return;

	// Use the same storage key as notifications page
	const STORAGE_KEY = 'rr_notifications_v1';
	const officialCatalog = [
		{
			key: 'kea-exam-schedule',
			title: 'KEA Exam Schedule',
			text: 'Official KEA exam schedule has been released — check the KEA portal for detailed dates and instructions.',
			type: 'exam',
			priority: 'high',
			offsetMs: 5 * 3600 * 1000,
			legacyTitles: ['kea psit update'],
		},
		{
			key: 'comedk-exam-schedule',
			title: 'COMEDK Exam Schedule Released',
			text: 'COMEDK UGET exam dates are announced. Check the official website for application and exam details.',
			type: 'exam',
			priority: 'high',
			offsetMs: 5 * 3600 * 1000,
		},
		{
			key: 'pessat-registrations-open',
			title: 'PESSAT Registrations Open',
			text: 'PESSAT registration is now open. Apply early to secure your slot.',
			type: 'exam',
			priority: 'high',
			offsetMs: 24 * 3600 * 1000,
		},
		{
			key: 'rvu-entrance-update',
			title: 'RVU Entrance Test Update',
			text: 'RV University entrance exam details updated. Check eligibility and schedule.',
			type: 'exam',
			priority: 'medium',
			offsetMs: 2 * 24 * 3600 * 1000,
		},
		{
			key: 'reva-cet-notification',
			title: 'REVA CET Notification',
			text: 'REVA CET exam schedule released. Visit official portal for details.',
			type: 'exam',
			priority: 'medium',
			offsetMs: 3 * 24 * 3600 * 1000,
		},
		{
			key: 'dsu-entrance-exam-info',
			title: 'DSU Entrance Exam Info',
			text: 'DSU entrance exam details available. Check dates and syllabus.',
			type: 'exam',
			priority: 'medium',
			offsetMs: 4 * 24 * 3600 * 1000,
		},
	];
	const now = Date.now();
	const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
	const source = Array.isArray(stored) ? stored : [];
	const notifications = officialCatalog.map((item, index) => {
		const match = source.find((entry) => {
			const title = String(entry?.title || '').trim().toLowerCase();
			return title === item.title.toLowerCase() || item.legacyTitles?.includes(title);
		});
		if (match) {
			return {
				...match,
				title: item.title,
				text: item.text,
				type: item.type,
				priority: item.priority,
				read: Boolean(match.read),
				datetime: match.datetime || new Date(now - item.offsetMs).toISOString(),
			};
		}
		return {
			id: now + index + 1,
			title: item.title,
			text: item.text,
			datetime: new Date(now - item.offsetMs).toISOString(),
			type: item.type,
			priority: item.priority,
			read: false,
		};
	});
	localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));

	function updateBadge() {
		// Show red badge ONLY if there are unread high-priority notifications
		const unreadHigh = notifications.filter(n => !n.read && n.priority === 'high').length;
		if (!badge) return;
		if (unreadHigh > 0) {
			badge.textContent = String(unreadHigh);
			badge.style.display = 'inline-flex';
		} else {
			badge.style.display = 'none';
		}
	}

	// update badge on load
	updateBadge();

	// Clicking the bell now redirects to the notifications page (full view)
	bell.addEventListener('click', (ev) => {
		window.location.href = '/html/notifications.html';
	});
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
			window.open('/html/predictorpage.html', '_blank');
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

/* ----------------- Initialization ----------------- */
document.addEventListener("DOMContentLoaded", () => {
	setupForms();
	setupDashboard();
	setupSidebarToggle();
	renderComparisonChart();
	renderCutoffChart();
	setupSubjectAnalysis();
	renderAIPredictorPlaceholder();
	animateCounters();
	setupNotifications();
	setupExamButtons();
	setupThemeToggle();
	setupButtonRipples();

	// initialize dashboard map if present
	try { initDashboardMap(); } catch (e) { /* ignore if leaflet missing */ }

	// map / explore buttons
	document.getElementById('exploreMapBtn')?.addEventListener('click', () => window.location.href = '/html/map.html');
	document.getElementById('openMapBtn')?.addEventListener('click', () => window.location.href = '/html/map.html');
});
