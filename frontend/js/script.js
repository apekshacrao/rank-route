const API_BASE_URL = "http://127.0.0.1:5000";
const SUBJECT_ANALYSIS_STORAGE_KEY = "kcet_subject_scores";
const SUBJECT_TARGET_SCORE = 85;

let subjectScoreChartInstance = null;
let subjectGapChartInstance = null;
let cutoffChartInstance = null;

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

function renderPredictionTable(predictions) {
	if (!predictions.length) {
		return "<div class='alert alert-warning'>No colleges found for your inputs.</div>";
	}

	const rows = predictions
		.map((item) => {
			const chanceValue = item.chance || item.admission_chance || "Low";
			const chanceClass = chanceValue === "High"
				? "text-success"
				: chanceValue === "Medium"
					? "text-warning"
					: "text-danger";
			const collegeName = item.college || item.college_name || "-";
			const cutoffValue = item.last_year_cutoff || "-";

			return `
				<tr>
					<td>${collegeName}</td>
					<td>${item.branch}</td>
					<td>${cutoffValue}</td>
					<td class="${chanceClass}">${chanceValue}</td>
				</tr>
			`;
		})
		.join("");

	return `
		<table class="table table-bordered table-striped">
			<thead>
				<tr>
					<th>College</th>
					<th>Branch</th>
					<th>Last Year Cutoff</th>
					<th>Admission Chance</th>
				</tr>
			</thead>
			<tbody>${rows}</tbody>
		</table>
	`;
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
	renderAIPredictorPanel(data, payload);
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

document.addEventListener("DOMContentLoaded", () => {
	setupForms();
	setupDashboard();
	setupSidebarToggle();
	renderComparisonChart();
	renderCutoffChart();
	setupSubjectAnalysis();
	renderAIPredictorPlaceholder();
});
