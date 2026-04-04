// Difficulty-based mock test engine for RankRoute.
(function () {
	const state = {
		difficulty: null,
		quizSets: [],
		activeQuiz: null,
		currentQuestionIndex: 0,
		selectedAnswers: [],
		timeLeft: 0,
		timerId: null,
		startedAt: 0,
		submitted: false,
		showFullReview: false,
		examModeActive: false,
		allowFullscreenExit: false,
		visibilityWarnings: 0,
		yourLeaderboardEntryId: null,
		lastSubmission: null,
	};

	let difficultyChartInstance = null;
	let subjectChartInstance = null;

	function $(id) {
		return document.getElementById(id);
	}

	function getStoredUser() {
		try {
			const raw = localStorage.getItem("kcet_user");
			return raw ? JSON.parse(raw) : null;
		} catch (_error) {
			return null;
		}
	}

	function escapeHtml(text) {
		return String(text)
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/\"/g, "&quot;")
			.replace(/'/g, "&#39;");
	}

	function formatTime(totalSeconds) {
		const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
		const minutes = String(Math.floor(safeSeconds / 60)).padStart(2, "0");
		const seconds = String(safeSeconds % 60).padStart(2, "0");
		return `${minutes}:${seconds}`;
	}

	function formatClock(totalSeconds) {
		const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
		const minutes = Math.floor(safeSeconds / 60);
		const seconds = safeSeconds % 60;
		return `${minutes}:${String(seconds).padStart(2, "0")}`;
	}

	function setStatus(text) {
		const status = $("quizGenerationStatus");
		if (status) {
			status.textContent = text;
		}
	}

	function setDifficultyActive(difficulty) {
		document.querySelectorAll(".difficulty-card").forEach((button) => {
			const isActive = button.dataset.difficulty === difficulty;
			button.classList.toggle("active", isActive);
			button.setAttribute("aria-pressed", String(isActive));
		});
	}

	function stopTimer() {
		if (state.timerId) {
			clearInterval(state.timerId);
			state.timerId = null;
		}
	}

	function destroyChart(chartInstance) {
		if (chartInstance) {
			chartInstance.destroy();
		}
	}

	function showPanel(panelId, visible) {
		const panel = $(panelId);
		if (panel) {
			panel.classList.toggle("hidden", !visible);
		}
	}

	function showSubmitLoader(visible) {
		const loader = $("submitLoader");
		if (loader) {
			loader.classList.toggle("hidden", !visible);
		}
	}

	function resetExamWarningBar() {
		const warning = $("examWarningBar");
		if (!warning) {
			return;
		}
		warning.classList.add("hidden");
		warning.textContent = "Tab switched. Please return to the test window to continue fairly.";
	}

	function showExamWarning(message) {
		const warning = $("examWarningBar");
		if (!warning) {
			return;
		}
		warning.textContent = message;
		warning.classList.remove("hidden");
	}

	async function enterFullscreen() {
		const target = document.documentElement;
		if (!target.requestFullscreen || document.fullscreenElement) {
			return;
		}
		try {
			await target.requestFullscreen();
		} catch (_error) {
			setStatus("Fullscreen blocked by browser. Continue in focused mode.");
		}
	}

	async function exitFullscreen() {
		if (!document.fullscreenElement || !document.exitFullscreen) {
			return;
		}
		try {
			await document.exitFullscreen();
		} catch (_error) {
			setStatus("Unable to exit fullscreen automatically.");
		}
	}

	async function activateExamMode() {
		state.examModeActive = true;
		state.visibilityWarnings = 0;
		state.allowFullscreenExit = false;
		document.body.classList.add("exam-mode");
		showPanel("quizSetPanel", false);
		showPanel("resultPanel", false);
		showPanel("leaderboardPanel", false);
		showPanel("analyticsPanel", false);
		showSubmitLoader(false);
		resetExamWarningBar();
		await enterFullscreen();
	}

	async function deactivateExamMode() {
		state.examModeActive = false;
		document.body.classList.remove("exam-mode");
		state.allowFullscreenExit = true;
		await exitFullscreen();
		state.allowFullscreenExit = false;
		resetExamWarningBar();
	}

	function handleFullscreenChange() {
		if (!state.examModeActive || state.allowFullscreenExit) {
			return;
		}

		if (!document.fullscreenElement) {
			const shouldExit = window.confirm("You are leaving full-screen exam mode. Do you want to continue outside full screen?");
			if (!shouldExit) {
				enterFullscreen();
				return;
			}
			setStatus("Exam continues outside fullscreen mode.");
		}
	}

	function handleVisibilityChange() {
		if (!state.examModeActive) {
			return;
		}

		if (document.hidden) {
			state.visibilityWarnings += 1;
			showExamWarning(`Warning ${state.visibilityWarnings}: tab switch detected.`);
			setStatus(`Tab switch detected (${state.visibilityWarnings}). Stay focused on the quiz.`);
		}
	}

	function answeredCount() {
		return state.selectedAnswers.filter((value) => value !== null && value !== undefined).length;
	}

	function updateTimer() {
		const timer = $("timerDisplay");
		if (timer) {
			timer.textContent = formatTime(state.timeLeft);
		}
	}

	function animateQuestionCard() {
		const card = document.querySelector(".question-card");
		if (card && typeof card.animate === "function") {
			card.animate(
				[
					{ opacity: 0.6, transform: "translateY(8px)" },
					{ opacity: 1, transform: "translateY(0)" },
				],
				{ duration: 180, easing: "ease-out" },
			);
		}
	}

	function questionCount() {
		return state.activeQuiz ? state.activeQuiz.questions.length : 0;
	}

	function renderQuestion() {
		if (!state.activeQuiz) {
			return;
		}

		const currentQuestion = state.activeQuiz.questions[state.currentQuestionIndex];
		const totalQuestions = questionCount();
		if (!currentQuestion) {
			return;
		}

		$("activeQuizLabel").textContent = `Quiz ${state.activeQuiz.quiz_index + 1}`;
		$("activeQuizTitle").textContent = state.activeQuiz.title;
		$("quizVariantFocus").textContent = state.activeQuiz.variant_focus;
		$("quizSubjectMix").textContent = `${state.activeQuiz.difficulty.toUpperCase()} • ${state.activeQuiz.question_count} questions`;
		$("questionCounter").textContent = `Question ${state.currentQuestionIndex + 1} / ${totalQuestions}`;
		$("answeredCount").textContent = `${answeredCount()} answered`;
		$("questionTag").textContent = currentQuestion.subject;
		$("questionStateChip").textContent = state.submitted ? "Review mode" : "Attempt in progress";
		$("questionText").textContent = currentQuestion.question;

		const progress = totalQuestions ? ((state.currentQuestionIndex + 1) / totalQuestions) * 100 : 0;
		$("questionProgressBar").style.width = `${progress}%`;

		const optionList = $("optionList");
		optionList.innerHTML = "";

		currentQuestion.options.forEach((optionText, optionIndex) => {
			const optionButton = document.createElement("button");
			optionButton.type = "button";
			optionButton.className = "option-btn";
			optionButton.textContent = `${String.fromCharCode(65 + optionIndex)}. ${optionText}`;

			const selectedIndex = state.selectedAnswers[state.currentQuestionIndex];
			if (selectedIndex === optionIndex) {
				optionButton.classList.add("selected");
			}

			if (state.submitted) {
				optionButton.classList.add("locked");
				if (optionIndex === currentQuestion.correct_index) {
					optionButton.classList.add("correct");
				}
				if (selectedIndex === optionIndex && selectedIndex !== currentQuestion.correct_index) {
					optionButton.classList.add("wrong");
				}
			}

			optionButton.addEventListener("click", () => {
				if (state.submitted) {
					return;
				}
				state.selectedAnswers[state.currentQuestionIndex] = optionIndex;
				renderQuestion();
			});

			optionList.appendChild(optionButton);
		});

		$("prevQuestionBtn").disabled = state.currentQuestionIndex === 0;
		$("nextQuestionBtn").textContent = state.currentQuestionIndex === totalQuestions - 1 ? "Review" : "Next";
		$("nextQuestionBtn").disabled = state.submitted;
		$("submitQuizBtn").disabled = state.submitted;

		animateQuestionCard();
	}

	function renderQuizCards() {
		const quizSetGrid = $("quizSetGrid");
		if (!quizSetGrid) {
			return;
		}

		quizSetGrid.innerHTML = state.quizSets
			.map(
				(quiz, index) => `
					<article class="quiz-card ${state.activeQuiz && state.activeQuiz.quiz_id === quiz.quiz_id ? "active" : ""}">
						<div class="quiz-card-meta">
							<div>
								<div class="quiz-chip">Quiz ${index + 1}</div>
								<h3 class="quiz-card-title mt-2">${escapeHtml(quiz.title)}</h3>
							</div>
							<div class="attempt-badge">${escapeHtml(quiz.generated_by)}</div>
						</div>
						<p class="quiz-card-desc">${escapeHtml(quiz.variant_focus)}</p>
						<div class="d-flex justify-content-between align-items-center gap-2 flex-wrap">
							<span class="attempt-chip">${quiz.question_count} questions</span>
							<span class="attempt-chip">${formatTime(quiz.duration_seconds)}</span>
						</div>
						<div class="d-flex gap-2 flex-wrap">
							<button type="button" class="btn btn-primary start-quiz-btn" data-quiz-id="${quiz.quiz_id}">Start Quiz</button>
						</div>
					</article>
				`,
			)
			.join("");

		quizSetGrid.querySelectorAll(".start-quiz-btn").forEach((button) => {
			button.addEventListener("click", () => startQuiz(button.dataset.quizId));
		});
	}

	async function generateQuizzes(difficulty) {
		state.difficulty = difficulty;
		state.quizSets = [];
		state.activeQuiz = null;
		state.currentQuestionIndex = 0;
		state.selectedAnswers = [];
		state.submitted = false;
		state.showFullReview = false;
		setDifficultyActive(difficulty);
		setStatus(`Generating ${difficulty} quizzes...`);
		showPanel("quizRunnerPanel", false);
		showPanel("resultPanel", false);
		showPanel("analyticsPanel", false);
		showPanel("leaderboardPanel", false);
		showPanel("quizSetPanel", false);
		showPanel("difficultyPanel", true);

		try {
			const response = await fetch("/generate-quiz", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ difficulty }),
			});
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to generate quizzes.");
			}

			state.quizSets = Array.isArray(data.quizzes) ? data.quizzes : [];
			$("quizSetSummary").textContent = `${state.quizSets.length} quizzes generated for ${difficulty.toUpperCase()} difficulty.`;
			setStatus(`Generated ${state.quizSets.length} quizzes. Select one to begin.`);
			renderQuizCards();
			showPanel("quizSetPanel", true);
		} catch (error) {
			setStatus(error.message || "Quiz generation failed.");
		}
	}

	function startTimer() {
		stopTimer();
		updateTimer();
		state.timerId = setInterval(() => {
			state.timeLeft -= 1;
			updateTimer();
			if (state.timeLeft <= 0) {
				submitQuiz(true);
			}
		}, 1000);
	}

	function startQuiz(quizId) {
		const quiz = state.quizSets.find((item) => item.quiz_id === quizId);
		if (!quiz) {
			return;
		}

		state.activeQuiz = quiz;
		state.currentQuestionIndex = 0;
		state.selectedAnswers = new Array(quiz.questions.length).fill(null);
		state.timeLeft = quiz.duration_seconds;
		state.startedAt = Date.now();
		state.submitted = false;
		state.showFullReview = false;
		state.yourLeaderboardEntryId = null;
		state.lastSubmission = null;

		$("quizSetSummary").textContent = `${quiz.title} selected. The timer has started.`;
		showPanel("quizRunnerPanel", true);
		showPanel("resultPanel", false);
		showPanel("analyticsPanel", false);
		showPanel("leaderboardPanel", false);
		showPanel("difficultyPanel", false);
		showPanel("quizSetPanel", false);
		renderQuizCards();
		renderQuestion();
		startTimer();
		setStatus(`Running ${quiz.title}.`);
		activateExamMode();
	}

	function collectAnswers() {
		if (!state.activeQuiz) {
			return [];
		}

		return state.activeQuiz.questions.map((question, index) => ({
			question_id: question.id,
			selected_index: state.selectedAnswers[index],
		}));
	}

	function renderReviewCard(item, isMistake) {
		const card = document.createElement("article");
		card.className = `review-card ${item.is_correct ? "correct" : "wrong"}`;

		const questionRow = document.createElement("div");
		questionRow.className = "review-question";
		questionRow.textContent = item.question;

		const metaRow = document.createElement("div");
		metaRow.className = "review-answer-row";

		const userAnswer = document.createElement("span");
		userAnswer.className = `answer-pill ${item.selected_answer ? "user" : "na"}`;
		userAnswer.textContent = item.selected_answer ? `Your answer: ${item.selected_answer}` : "Your answer: Not answered";

		const correctAnswer = document.createElement("span");
		correctAnswer.className = "answer-pill correct";
		correctAnswer.textContent = `Correct answer: ${item.correct_answer}`;

		metaRow.appendChild(userAnswer);
		metaRow.appendChild(correctAnswer);

		const explanation = document.createElement("div");
		explanation.className = "review-explanation";
		explanation.textContent = item.explanation;

		card.appendChild(questionRow);
		card.appendChild(metaRow);
		card.appendChild(explanation);

		if (!isMistake && item.is_correct) {
			const status = document.createElement("div");
			status.className = "attempt-badge";
			status.textContent = "Correct";
			card.appendChild(status);
		}

		return card;
	}

	function renderReviewLists(result) {
		const mistakes = Array.isArray(result.mistakes) ? result.mistakes : [];
		const review = Array.isArray(result.review) ? result.review : [];
		const mistakeList = $("mistakeReviewList");
		const fullReviewList = $("fullReviewList");

		mistakeList.innerHTML = "";
		fullReviewList.innerHTML = "";

		if (!mistakes.length) {
			const emptyState = document.createElement("div");
			emptyState.className = "review-card correct";
			emptyState.textContent = "No mistakes. Perfect score on this quiz.";
			mistakeList.appendChild(emptyState);
		} else {
			mistakes.forEach((item) => mistakeList.appendChild(renderReviewCard(item, true)));
		}

		if (!review.length) {
			const emptyState = document.createElement("div");
			emptyState.className = "review-card correct";
			emptyState.textContent = "No review data available for this attempt.";
			fullReviewList.appendChild(emptyState);
		} else {
			review.forEach((item) => fullReviewList.appendChild(renderReviewCard(item, false)));
		}

		state.showFullReview = true;
		fullReviewList.classList.remove("is-collapsed");
		$("toggleReviewModeBtn").textContent = "Hide Full Review";
	}

	function renderFeedback(feedbackItems) {
		const list = $("feedbackList");
		list.innerHTML = "";
		const items = Array.isArray(feedbackItems) ? feedbackItems : [];

		items.forEach((text) => {
			const entry = document.createElement("div");
			entry.className = "leaderboard-item";
			entry.textContent = text;
			list.appendChild(entry);
		});
	}

	function rankBadge(rank) {
		if (rank === 1) {
			return "🥇 Top 1";
		}
		if (rank === 2) {
			return "🥈 Top 2";
		}
		if (rank === 3) {
			return "🥉 Top 3";
		}
		return `#${rank}`;
	}

	function renderLeaderboard(data) {
		const rows = $("leaderboardRows");
		const yourCard = $("yourRankCard");
		const summary = $("leaderboardSummary");
		const status = $("leaderboardStatus");
		if (!rows || !yourCard || !summary || !status) {
			return;
		}

		const entries = Array.isArray(data.entries) ? data.entries : [];
		const yourEntry = data.your_result || entries.find((entry) => entry.entry_id === state.yourLeaderboardEntryId) || null;
		rows.innerHTML = "";

		if (!entries.length) {
			const emptyRow = document.createElement("tr");
			emptyRow.innerHTML = '<td colspan="5" class="text-center text-muted">No leaderboard entries yet.</td>';
			rows.appendChild(emptyRow);
			summary.textContent = "Be the first one to post a score.";
			status.textContent = "No entries";
			yourCard.classList.add("hidden");
			return;
		}

		entries.forEach((entry) => {
			const tr = document.createElement("tr");
			const isYou = entry.entry_id === state.yourLeaderboardEntryId;
			if (isYou) {
				tr.classList.add("is-you");
			}

			const userLabel = isYou ? "You" : entry.username;
			tr.innerHTML = `
				<td><span class="rank-badge">${rankBadge(entry.rank)}</span></td>
				<td>${escapeHtml(userLabel)}</td>
				<td>${entry.score}/${entry.total_questions}</td>
				<td>${formatClock(entry.time_taken_seconds)}</td>
				<td>${Number(entry.percentage || 0).toFixed(2)}%</td>
			`;
			rows.appendChild(tr);
		});

		summary.textContent = "Ranking uses higher score first, then lower completion time.";
		status.textContent = "Leaderboard synced";

		if (!yourEntry) {
			yourCard.classList.add("hidden");
			return;
		}

		$("yourRankValue").textContent = `#${yourEntry.rank}`;
		$("yourScoreValue").textContent = `${yourEntry.score}/${yourEntry.total_questions}`;
		$("yourAccuracyValue").textContent = `${Number(yourEntry.percentage || 0).toFixed(2)}%`;
		yourCard.classList.remove("hidden");
	}

	function animateHighScore(percentage) {
		const panel = $("leaderboardPanel");
		if (!panel) {
			return;
		}
		panel.classList.remove("celebrate");
		if (percentage < 85) {
			return;
		}
		panel.classList.add("celebrate");
		window.setTimeout(() => panel.classList.remove("celebrate"), 2100);
	}

	async function submitScoreToLeaderboard(result) {
		const user = getStoredUser();
		const username = user && user.name ? user.name : "You";

		const response = await fetch("/submit-score", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				attempt_id: result.attempt_id,
				quiz_id: result.quiz_id,
				difficulty: result.difficulty,
				username,
				score: result.correct_count,
				total_questions: result.total_questions,
				percentage: result.percentage,
				time_taken_seconds: result.time_taken_seconds,
			}),
		});
		const data = await response.json();
		if (!response.ok) {
			throw new Error(data.error || "Failed to submit leaderboard score.");
		}

		state.yourLeaderboardEntryId = data.entry_id;
		return data;
	}

	async function loadLeaderboard() {
		if (!state.lastSubmission) {
			return;
		}

		const params = new URLSearchParams({
			difficulty: state.lastSubmission.difficulty,
			limit: "10",
		});
		if (state.yourLeaderboardEntryId) {
			params.set("your_entry_id", String(state.yourLeaderboardEntryId));
		}

		const response = await fetch(`/leaderboard?${params.toString()}`);
		const data = await response.json();
		if (!response.ok) {
			throw new Error(data.error || "Unable to load leaderboard.");
		}

		renderLeaderboard(data);
		showPanel("leaderboardPanel", true);
		animateHighScore(Number(state.lastSubmission.percentage || 0));
	}

	async function submitQuiz(autoSubmit = false) {
		if (!state.activeQuiz || state.submitted) {
			return;
		}

		state.submitted = true;
		stopTimer();
		updateTimer();
		showSubmitLoader(true);
		await deactivateExamMode();

		const timeTakenSeconds = Math.max(0, Math.min(state.activeQuiz.duration_seconds, Math.round((Date.now() - state.startedAt) / 1000)));
		setStatus(autoSubmit ? "Time ended. Auto-submitting quiz..." : "Submitting quiz...");

		try {
			const response = await fetch("/submit-quiz", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					quiz_id: state.activeQuiz.quiz_id,
					answers: collectAnswers(),
					time_taken_seconds: timeTakenSeconds,
					auto_submit: autoSubmit,
				}),
			});
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to submit quiz.");
			}

			$("resultScore").textContent = `${data.correct_count} / ${data.total_questions}`;
			$("resultPercentage").textContent = `${Number(data.percentage || 0).toFixed(2)}%`;
			$("resultTimeTaken").textContent = formatClock(data.time_taken_seconds);
			$("resultWrong").textContent = String(data.wrong_count);
			$("resultSummaryText").textContent = autoSubmit
				? "The quiz was auto-submitted because the timer expired."
				: `Attempt ${data.attempt_id} saved successfully.`;

			state.lastSubmission = data;

			renderReviewLists(data);
			renderFeedback(data.feedback);
			showPanel("quizRunnerPanel", false);
			showPanel("resultPanel", true);
			showPanel("analyticsPanel", false);
			showPanel("leaderboardPanel", true);
			showPanel("difficultyPanel", false);
			showPanel("quizSetPanel", false);
			setStatus(`Submitted ${state.activeQuiz.title}.`);

			try {
				await submitScoreToLeaderboard(data);
				await loadLeaderboard();
			} catch (leaderboardError) {
				$("leaderboardStatus").textContent = "Leaderboard unavailable";
				setStatus(leaderboardError.message || "Quiz submitted. Leaderboard unavailable.");
			}

			window.scrollTo({ top: 0, behavior: "smooth" });
		} catch (error) {
			setStatus(error.message || "Quiz submission failed.");
			state.submitted = false;
			startTimer();
			activateExamMode();
		} finally {
			showSubmitLoader(false);
		}
	}

	function renderAnalyticsPlaceholder() {
		const recentAttemptsList = $("recentAttemptsList");
		const analyticsSuggestions = $("analyticsSuggestions");
		recentAttemptsList.innerHTML = "";
		analyticsSuggestions.innerHTML = "";

		const emptyAttempts = document.createElement("div");
		emptyAttempts.className = "attempt-item";
		emptyAttempts.innerHTML = "<div><strong>No attempts yet</strong><div class='attempt-subtext'>Finish a quiz to populate charts and history.</div></div><span class='attempt-badge'>Waiting</span>";
		recentAttemptsList.appendChild(emptyAttempts);

		const emptySuggestion = document.createElement("div");
		emptySuggestion.className = "leaderboard-item";
		emptySuggestion.textContent = "Your improvement suggestions will appear after the first submission.";
		analyticsSuggestions.appendChild(emptySuggestion);
	}

	function renderCharts(analytics) {
		const difficultySummary = Array.isArray(analytics.difficulty_summary) ? analytics.difficulty_summary : [];
		const subjectSummary = Array.isArray(analytics.subject_summary) ? analytics.subject_summary : [];

		destroyChart(difficultyChartInstance);
		destroyChart(subjectChartInstance);

		const difficultyCtx = $("difficultyAccuracyChart")?.getContext("2d");
		const subjectCtx = $("subjectWeaknessChart")?.getContext("2d");

		if (difficultyCtx) {
			difficultyChartInstance = new Chart(difficultyCtx, {
				type: "bar",
				data: {
					labels: difficultySummary.map((row) => row.difficulty.toUpperCase()),
					datasets: [{ label: "Accuracy %", data: difficultySummary.map((row) => Number(row.accuracy || 0)), backgroundColor: ["#2fb66f", "#f08e2e", "#de4747"], borderRadius: 10 }],
				},
				options: {
					responsive: true,
					plugins: { legend: { display: false } },
					scales: { y: { beginAtZero: true, max: 100, ticks: { callback: (value) => `${value}%` } } },
				},
			});
		}

		if (subjectCtx) {
			subjectChartInstance = new Chart(subjectCtx, {
				type: "doughnut",
				data: {
					labels: subjectSummary.map((row) => row.subject),
					datasets: [{ data: subjectSummary.map((row) => Number(row.accuracy || 0)), backgroundColor: ["#4f6de6", "#f08e2e", "#de4747"], borderWidth: 0 }],
				},
				options: {
					responsive: true,
					plugins: { legend: { position: "bottom" } },
				},
			});
		}
	}

	function renderAttemptHistory(attempts) {
		const list = $("recentAttemptsList");
		list.innerHTML = "";

		if (!attempts.length) {
			renderAnalyticsPlaceholder();
			return;
		}

		attempts.slice(0, 6).forEach((attempt) => {
			const row = document.createElement("div");
			row.className = "attempt-item";

			const leftSide = document.createElement("div");
			const title = document.createElement("strong");
			title.textContent = `${attempt.difficulty.toUpperCase()} Quiz ${attempt.quiz_number}`;
			const subtext = document.createElement("div");
			subtext.className = "attempt-subtext";
			subtext.textContent = `${attempt.score}/${attempt.question_count} correct • ${formatClock(attempt.time_taken_seconds)} • ${attempt.created_at}`;
			leftSide.appendChild(title);
			leftSide.appendChild(subtext);

			const badge = document.createElement("span");
			badge.className = "attempt-badge";
			badge.textContent = `${Number(attempt.percentage || 0).toFixed(2)}%`;

			row.appendChild(leftSide);
			row.appendChild(badge);
			list.appendChild(row);
		});
	}

	function renderSuggestions(suggestions) {
		const list = $("analyticsSuggestions");
		list.innerHTML = "";
		const rows = Array.isArray(suggestions) ? suggestions : [];

		if (!rows.length) {
			const empty = document.createElement("div");
			empty.className = "leaderboard-item";
			empty.textContent = "No suggestions available yet.";
			list.appendChild(empty);
			return;
		}

		rows.forEach((suggestion) => {
			const item = document.createElement("div");
			item.className = "leaderboard-item";
			item.textContent = suggestion;
			list.appendChild(item);
		});
	}

	async function loadAnalytics() {
		try {
			const response = await fetch("/quiz-analytics");
			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.error || "Unable to load analytics.");
			}

			renderCharts(data);
			renderAttemptHistory(Array.isArray(data.recent_attempts) ? data.recent_attempts : []);
			renderSuggestions(data.suggestions || []);
			$("analyticsStatus").textContent = "Synced with saved attempts";
			showPanel("analyticsPanel", true);
		} catch (error) {
			$("analyticsStatus").textContent = error.message || "Analytics unavailable";
			renderAnalyticsPlaceholder();
			showPanel("analyticsPanel", true);
		}
	}

	function bindEvents() {
		document.querySelectorAll(".difficulty-card").forEach((button) => {
			button.addEventListener("click", () => {
				generateQuizzes(button.dataset.difficulty);
			});
		});

		$("regenerateQuizzesBtn").addEventListener("click", () => {
			if (state.difficulty) {
				generateQuizzes(state.difficulty);
			}
		});

		$("prevQuestionBtn").addEventListener("click", () => {
			if (state.currentQuestionIndex > 0) {
				state.currentQuestionIndex -= 1;
				renderQuestion();
			}
		});

		$("nextQuestionBtn").addEventListener("click", () => {
			if (!state.activeQuiz) {
				return;
			}
			if (state.currentQuestionIndex < state.activeQuiz.questions.length - 1) {
				state.currentQuestionIndex += 1;
				renderQuestion();
			} else {
				submitQuiz(false);
			}
		});

		$("submitQuizBtn").addEventListener("click", () => submitQuiz(false));

		$("toggleReviewModeBtn").addEventListener("click", () => {
			state.showFullReview = !state.showFullReview;
			$("fullReviewList").classList.toggle("is-collapsed", !state.showFullReview);
			$("toggleReviewModeBtn").textContent = state.showFullReview ? "Hide Full Review" : "View All Questions";
		});

		$("retakeQuizBtn").addEventListener("click", () => {
			if (state.difficulty) {
				generateQuizzes(state.difficulty);
			}
		});

		const playAgainBtn = $("playAgainBtn");
		if (playAgainBtn) {
			playAgainBtn.addEventListener("click", () => {
				if (state.difficulty) {
					generateQuizzes(state.difficulty);
				}
			});
		}

		const reviewMistakesBtn = $("reviewMistakesBtn");
		if (reviewMistakesBtn) {
			reviewMistakesBtn.addEventListener("click", () => {
				showPanel("resultPanel", true);
				window.scrollTo({ top: $("resultPanel").offsetTop - 12, behavior: "smooth" });
			});
		}

		document.addEventListener("fullscreenchange", handleFullscreenChange);
		document.addEventListener("visibilitychange", handleVisibilityChange);
	}

	function initializePage() {
		if (!$("difficultyCards")) {
			return;
		}

		bindEvents();
		setStatus("Choose a difficulty to generate quizzes.");
		updateTimer();
		renderAnalyticsPlaceholder();
		showPanel("analyticsPanel", false);
		showPanel("leaderboardPanel", false);
		showPanel("difficultyPanel", true);
		showSubmitLoader(false);
		resetExamWarningBar();
	}

	document.addEventListener("DOMContentLoaded", initializePage);
})();