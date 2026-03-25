// Mock test engine for the dedicated KCET practice page.
(function () {
	const QUESTION_BANK = [
		{ subject: "Physics", question: "The SI unit of electric flux is:", options: ["N m^2 C^-1", "C m^-1", "V m", "N C m^-2"], answer: 0 },
		{ subject: "Physics", question: "In simple harmonic motion, acceleration is:", options: ["Constant", "Proportional to displacement", "In phase with velocity", "Zero at extremes"], answer: 1 },
		{ subject: "Physics", question: "For a projectile launched at angle theta, time of flight is:", options: ["2u sin(theta)/g", "u cos(theta)/g", "u sin(theta)/g", "2u cos(theta)/g"], answer: 0 },
		{ subject: "Physics", question: "Kirchhoff's current law is based on conservation of:", options: ["Charge", "Energy", "Momentum", "Mass"], answer: 0 },
		{ subject: "Physics", question: "A convex lens has focal length +20 cm. Its power is:", options: ["+2 D", "+5 D", "-5 D", "+0.2 D"], answer: 1 },
		{ subject: "Physics", question: "The dimensional formula of pressure is:", options: ["M L^-1 T^-2", "M L T^-2", "M L^2 T^-2", "M^0 L^-1 T^-1"], answer: 0 },
		{ subject: "Physics", question: "In an AC circuit containing only resistance, current and voltage are:", options: ["90 deg out of phase", "In phase", "180 deg out of phase", "Current leads by 45 deg"], answer: 1 },
		{ subject: "Physics", question: "The de Broglie wavelength is inversely proportional to:", options: ["Velocity", "Momentum", "Frequency", "Time period"], answer: 1 },
		{ subject: "Physics", question: "If force is doubled and mass is halved, acceleration becomes:", options: ["Same", "2 times", "4 times", "Half"], answer: 2 },
		{ subject: "Physics", question: "The escape velocity on Earth is approximately:", options: ["11.2 km/s", "7.9 km/s", "9.8 km/s", "3.2 km/s"], answer: 0 },

		{ subject: "Chemistry", question: "The hybridization of carbon in methane is:", options: ["sp", "sp2", "sp3", "dsp2"], answer: 2 },
		{ subject: "Chemistry", question: "The pH of a neutral solution at 25 C is:", options: ["0", "7", "14", "1"], answer: 1 },
		{ subject: "Chemistry", question: "Avogadro number is:", options: ["6.022 x 10^23", "3.011 x 10^23", "1.602 x 10^-19", "9.1 x 10^-31"], answer: 0 },
		{ subject: "Chemistry", question: "The IUPAC name of CH3-CH2-OH is:", options: ["Methanol", "Ethanol", "Propanol", "Ethanal"], answer: 1 },
		{ subject: "Chemistry", question: "Among halogens, most reactive is:", options: ["Chlorine", "Bromine", "Fluorine", "Iodine"], answer: 2 },
		{ subject: "Chemistry", question: "In electrolysis of water, gas evolved at cathode is:", options: ["Oxygen", "Hydrogen", "Nitrogen", "Chlorine"], answer: 1 },
		{ subject: "Chemistry", question: "The oxidation state of Mn in KMnO4 is:", options: ["+2", "+4", "+7", "+6"], answer: 2 },
		{ subject: "Chemistry", question: "Benzene shows:", options: ["Only addition", "Only substitution", "Substitution due to aromaticity", "No reaction"], answer: 2 },
		{ subject: "Chemistry", question: "Strongest reducing agent among alkali metals is:", options: ["Li", "Na", "K", "Cs"], answer: 0 },
		{ subject: "Chemistry", question: "The shape of NH3 molecule is:", options: ["Linear", "Trigonal planar", "Trigonal pyramidal", "Tetrahedral"], answer: 2 },

		{ subject: "Mathematics", question: "If f(x)=x^2, then f'(x)=", options: ["x", "2x", "x^2", "2"], answer: 1 },
		{ subject: "Mathematics", question: "The value of sin^2(theta)+cos^2(theta) is:", options: ["0", "1", "2", "sin(theta)"], answer: 1 },
		{ subject: "Mathematics", question: "For matrix multiplication AB to be defined, number of columns of A must equal:", options: ["Rows of A", "Rows of B", "Columns of B", "Determinant of B"], answer: 1 },
		{ subject: "Mathematics", question: "The sum of first n natural numbers is:", options: ["n(n+1)/2", "n^2", "n(n-1)/2", "2n"], answer: 0 },
		{ subject: "Mathematics", question: "Derivative of e^x is:", options: ["x e^(x-1)", "e^x", "ln x", "1/e^x"], answer: 1 },
		{ subject: "Mathematics", question: "If two events are mutually exclusive, P(A intersection B)=", options: ["1", "P(A)+P(B)", "0", "P(A)P(B)"], answer: 2 },
		{ subject: "Mathematics", question: "The distance between points (0,0) and (3,4) is:", options: ["5", "7", "1", "12"], answer: 0 },
		{ subject: "Mathematics", question: "Integral of 1/x dx is:", options: ["x", "ln|x|+C", "1/x^2", "e^x"], answer: 1 },
		{ subject: "Mathematics", question: "If tan(theta)=1, then theta can be:", options: ["30 deg", "45 deg", "60 deg", "90 deg"], answer: 1 },
		{ subject: "Mathematics", question: "Number of ways to arrange 5 distinct books is:", options: ["10", "25", "120", "60"], answer: 2 }
	];

	// 10 different mock sets, each mapped to 10 question indexes.
	const MOCK_TEST_SETS = [
		{ id: 1, title: "KCET Trend Set 1", source: "AI mix: Mechanics + Physical Chemistry + Algebra", indexes: [0, 2, 4, 7, 10, 12, 14, 18, 21, 23] },
		{ id: 2, title: "KCET Trend Set 2", source: "AI mix: Electrostatics + Organic + Calculus", indexes: [1, 3, 6, 8, 11, 13, 17, 20, 24, 27] },
		{ id: 3, title: "KCET Trend Set 3", source: "AI mix: Optics + Inorganic + Coordinate", indexes: [5, 9, 2, 4, 15, 16, 19, 22, 26, 29] },
		{ id: 4, title: "KCET Trend Set 4", source: "Previous-year style balance", indexes: [0, 6, 7, 9, 10, 14, 18, 23, 25, 28] },
		{ id: 5, title: "KCET Trend Set 5", source: "Higher difficulty mixed concepts", indexes: [1, 5, 8, 3, 12, 17, 19, 21, 24, 29] },
		{ id: 6, title: "KCET Trend Set 6", source: "AI mix: Formula-focused quick test", indexes: [4, 2, 0, 6, 11, 16, 15, 20, 22, 27] },
		{ id: 7, title: "KCET Trend Set 7", source: "MCQ pattern: speed + accuracy", indexes: [9, 3, 1, 7, 13, 14, 18, 25, 26, 28] },
		{ id: 8, title: "KCET Trend Set 8", source: "Chapter-weightage simulation", indexes: [8, 5, 2, 4, 10, 12, 17, 23, 24, 29] },
		{ id: 9, title: "KCET Trend Set 9", source: "AI mix: last-minute revision set", indexes: [0, 1, 6, 7, 11, 15, 19, 21, 27, 28] },
		{ id: 10, title: "KCET Trend Set 10", source: "Previous-year trend simulation", indexes: [3, 4, 5, 8, 12, 13, 16, 22, 25, 26] }
	];

	const TEST_DURATION_SECONDS = 10 * 60;
	let activeSet = null;
	let questions = [];
	let currentIndex = 0;
	let selectedAnswers = [];
	let timeLeft = TEST_DURATION_SECONDS;
	let timerId = null;
	let isSubmitted = false;

	function shuffleArray(input) {
		const arr = [...input];
		for (let i = arr.length - 1; i > 0; i -= 1) {
			const j = Math.floor(Math.random() * (i + 1));
			[arr[i], arr[j]] = [arr[j], arr[i]];
		}
		return arr;
	}

	function formatTime(totalSeconds) {
		const min = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
		const sec = (totalSeconds % 60).toString().padStart(2, "0");
		return `${min}:${sec}`;
	}

	function getElements() {
		return {
			startBtn: document.getElementById("startMockBtn"),
			submitBtn: document.getElementById("submitMockBtn"),
			prevBtn: document.getElementById("prevQuestionBtn"),
			nextBtn: document.getElementById("nextQuestionBtn"),
			timer: document.getElementById("timerDisplay"),
			setLabel: document.getElementById("mockSetLabel"),
			questionCard: document.getElementById("mockQuestionCard"),
			resultCard: document.getElementById("mockResultCard"),
			counter: document.getElementById("questionCounter"),
			tag: document.getElementById("questionTag"),
			questionText: document.getElementById("questionText"),
			optionList: document.getElementById("optionList"),
			resultScore: document.getElementById("resultScore"),
			resultCorrect: document.getElementById("resultCorrect"),
			resultWrong: document.getElementById("resultWrong"),
			resultPercentage: document.getElementById("resultPercentage")
		};
	}

	function renderQuestion() {
		const el = getElements();
		const current = questions[currentIndex];
		if (!current || !el.questionText) {
			return;
		}

		el.counter.textContent = `Question ${currentIndex + 1} / ${questions.length}`;
		el.tag.textContent = current.subject;
		el.questionText.textContent = current.question;
		el.optionList.innerHTML = "";

		current.options.forEach((option, index) => {
			const optionBtn = document.createElement("button");
			optionBtn.type = "button";
			optionBtn.className = "option-btn";
			optionBtn.textContent = `${String.fromCharCode(65 + index)}. ${option}`;
			if (selectedAnswers[currentIndex] === index) {
				optionBtn.classList.add("selected");
			}

			optionBtn.addEventListener("click", () => {
				selectedAnswers[currentIndex] = index;
				renderQuestion();
			});

			el.optionList.appendChild(optionBtn);
		});

		el.prevBtn.disabled = currentIndex === 0;
		el.nextBtn.textContent = currentIndex === questions.length - 1 ? "Review" : "Next";
	}

	function stopTimer() {
		if (timerId) {
			clearInterval(timerId);
			timerId = null;
		}
	}

	function startTimer() {
		const el = getElements();
		stopTimer();
		timeLeft = TEST_DURATION_SECONDS;
		el.timer.textContent = formatTime(timeLeft);

		timerId = setInterval(() => {
			timeLeft -= 1;
			el.timer.textContent = formatTime(Math.max(0, timeLeft));
			if (timeLeft <= 0) {
				submitMockTest(true);
			}
		}, 1000);
	}

	function getRandomSet() {
		const randomIndex = Math.floor(Math.random() * MOCK_TEST_SETS.length);
		return MOCK_TEST_SETS[randomIndex];
	}

	function buildQuestionSet(setConfig) {
		const selectedQuestions = setConfig.indexes.map((idx) => {
			const base = QUESTION_BANK[idx];
			const optionObjects = base.options.map((text, optionIndex) => ({ text, optionIndex }));
			const shuffledOptions = shuffleArray(optionObjects);
			const answer = shuffledOptions.findIndex((item) => item.optionIndex === base.answer);
			return {
				subject: base.subject,
				question: base.question,
				options: shuffledOptions.map((item) => item.text),
				answer
			};
		});
		return shuffleArray(selectedQuestions);
	}

	function startMockTest() {
		const el = getElements();
		activeSet = getRandomSet();
		questions = buildQuestionSet(activeSet);
		selectedAnswers = new Array(questions.length).fill(null);
		currentIndex = 0;
		isSubmitted = false;

		el.setLabel.textContent = `${activeSet.title} - ${activeSet.source}`;
		el.questionCard.classList.remove("hidden");
		el.resultCard.classList.add("hidden");
		el.submitBtn.disabled = false;
		startTimer();
		renderQuestion();
	}

	function submitMockTest(autoSubmit = false) {
		if (!questions.length || isSubmitted) {
			return;
		}
		isSubmitted = true;
		stopTimer();

		let correct = 0;
		questions.forEach((question, index) => {
			if (selectedAnswers[index] === question.answer) {
				correct += 1;
			}
		});
		const wrong = questions.length - correct;
		const percentage = ((correct / questions.length) * 100).toFixed(1);

		const el = getElements();
		el.resultScore.textContent = `${correct} / ${questions.length}`;
		el.resultCorrect.textContent = String(correct);
		el.resultWrong.textContent = String(wrong);
		el.resultPercentage.textContent = `${percentage}%`;
		el.resultCard.classList.remove("hidden");
		el.submitBtn.disabled = true;

		if (autoSubmit) {
			el.setLabel.textContent = `${activeSet.title} - Time ended, test auto-submitted.`;
		}
	}

	function setupMockTestPage() {
		const el = getElements();
		if (!el.startBtn) {
			return;
		}

		el.timer.textContent = formatTime(TEST_DURATION_SECONDS);

		el.startBtn.addEventListener("click", startMockTest);
		el.submitBtn.addEventListener("click", () => submitMockTest(false));

		el.prevBtn.addEventListener("click", () => {
			if (currentIndex > 0) {
				currentIndex -= 1;
				renderQuestion();
			}
		});

		el.nextBtn.addEventListener("click", () => {
			if (!questions.length) {
				return;
			}
			if (currentIndex < questions.length - 1) {
				currentIndex += 1;
				renderQuestion();
			}
		});
	}

	document.addEventListener("DOMContentLoaded", setupMockTestPage);
})();
