/**
 * NIC DECODED — Application Logic
 * ═══════════════════════════════════════════════════════════════
 * Modules:
 *   1. NICParser      — Core parsing engine (Old & New format)
 *   2. ZodiacEngine   — Zodiac sign derivation
 *   3. UIController   — DOM manipulation & animations
 *   4. SoundEngine    — Subtle audio feedback
 *   5. App            — Bootstrap & event binding
 * ═══════════════════════════════════════════════════════════════
 */

'use strict';

/* ═══════════════════════════════════════════════════════════════
   MODULE 1: NIC PARSER
═══════════════════════════════════════════════════════════════ */
const NICParser = (() => {

  /**
   * Determines if a given year is a leap year.
   * @param {number} year
   * @returns {boolean}
   */
  const isLeapYear = (year) =>
    (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);

  /**
   * Converts a day-of-year number (1-indexed) into a calendar date.
   * @param {number} dayOfYear — 1-based day number within the year
   * @param {number} year
   * @returns {{ month: number, day: number }} — month is 1-indexed
   */
  const dayOfYearToDate = (dayOfYear, year) => {
    const monthLengths = [
      31,                                    // Jan
      isLeapYear(year) ? 29 : 28,            // Feb
      31, 30, 31, 30, 31, 31, 30, 31, 30, 31 // Mar–Dec
    ];

    let remaining = dayOfYear;
    let month = 0;

    for (let i = 0; i < 12; i++) {
      if (remaining <= monthLengths[i]) {
        month = i + 1;
        break;
      }
      remaining -= monthLengths[i];
    }

    return { month, day: remaining };
  };

  /**
   * Validates and normalises NIC input string.
   * @param {string} raw
   * @returns {{ valid: boolean, normalised: string, format: string|null, error: string|null }}
   */
  const validate = (raw) => {
    const trimmed = raw.trim().toUpperCase();

    // Old format: 9 digits + V or X
    const oldPattern = /^(\d{9})[VX]$/;
    // New format: exactly 12 digits
    const newPattern = /^\d{12}$/;

    if (oldPattern.test(trimmed)) {
      return { valid: true, normalised: trimmed, format: 'OLD', error: null };
    }
    if (newPattern.test(trimmed)) {
      return { valid: true, normalised: trimmed, format: 'NEW', error: null };
    }

    // Provide precise error messages
    if (trimmed.length === 0) {
      return { valid: false, normalised: trimmed, format: null, error: 'Please enter a NIC number.' };
    }
    if (/[^0-9VX]/.test(trimmed)) {
      return { valid: false, normalised: trimmed, format: null, error: 'Invalid characters. Use digits 0–9 and V or X only.' };
    }
    if (trimmed.length < 10) {
      return { valid: false, normalised: trimmed, format: null, error: `Too short (${trimmed.length} chars). Need 10 (old) or 12 (new).` };
    }
    if (trimmed.length > 12) {
      return { valid: false, normalised: trimmed, format: null, error: `Too long (${trimmed.length} chars). Max 12 digits.` };
    }
    if (trimmed.length === 11) {
      return { valid: false, normalised: trimmed, format: null, error: 'Invalid length. Old format: 9 digits + V/X. New: 12 digits.' };
    }
    return { valid: false, normalised: trimmed, format: null, error: 'Invalid NIC format. Expected 9+V/X or 12 digits.' };
  };

  /**
   * Core parsing function.
   * @param {string} nic — validated NIC string
   * @param {string} format — 'OLD' | 'NEW'
   * @returns {ParsedNIC}
   */
  const parse = (nic, format) => {
    let year, daySequence, votingLetter;

    if (format === 'OLD') {
      year        = 1900 + parseInt(nic.substring(0, 2), 10);
      daySequence = parseInt(nic.substring(2, 5), 10);
      votingLetter = nic[9]; // 'V' or 'X'
    } else {
      year        = parseInt(nic.substring(0, 4), 10);
      daySequence = parseInt(nic.substring(4, 7), 10);
      votingLetter = null; // New format always eligible
    }

    // Validate day sequence bounds (1–866)
    if (daySequence < 1 || daySequence > 866) {
      throw new RangeError(`Day sequence ${daySequence} is out of valid range (1–866).`);
    }

    // Gender extraction: female day sequences are offset by 500
    let gender, dayOfYear;
    if (daySequence > 500) {
      gender     = 'Female';
      dayOfYear  = daySequence - 500;
    } else {
      gender     = 'Male';
      dayOfYear  = daySequence;
    }

    // Additional check: resolved dayOfYear must be in valid range (1–366)
    if (dayOfYear < 1 || dayOfYear > 366) {
      throw new RangeError(`Resolved day-of-year ${dayOfYear} is invalid.`);
    }
    // Non-leap year cannot have day 366
    if (dayOfYear === 366 && !isLeapYear(year)) {
      throw new RangeError(`Day 366 is invalid for non-leap year ${year}.`);
    }

    const { month, day } = dayOfYearToDate(dayOfYear, year);

    // Voting eligibility
    let votingEligible;
    if (format === 'NEW') {
      votingEligible = true; // New format holders are always eligible
    } else {
      votingEligible = (votingLetter === 'V');
    }

    return {
      format,
      nic,
      year,
      month,     // 1-indexed
      day,
      gender,
      votingEligible,
      votingLetter,
    };
  };

  /**
   * Public API: validate + parse in one call.
   * @param {string} rawInput
   * @returns {{ success: boolean, data?: ParsedNIC, error?: string }}
   */
  const decode = (rawInput) => {
    const { valid, normalised, format, error } = validate(rawInput);

    if (!valid) {
      return { success: false, error };
    }

    try {
      const data = parse(normalised, format);
      return { success: true, data };
    } catch (e) {
      return { success: false, error: e.message };
    }
  };

  return { decode, validate };

})();


/* ═══════════════════════════════════════════════════════════════
   MODULE 2: ZODIAC ENGINE
═══════════════════════════════════════════════════════════════ */
const ZodiacEngine = (() => {

  const SIGNS = [
    { name: 'Capricorn', symbol: '♑', emoji: '🐐', dates: 'Dec 22 – Jan 19',  startM: 12, startD: 22 },
    { name: 'Aquarius',  symbol: '♒', emoji: '🏺', dates: 'Jan 20 – Feb 18',  startM:  1, startD: 20 },
    { name: 'Pisces',    symbol: '♓', emoji: '🐟', dates: 'Feb 19 – Mar 20',  startM:  2, startD: 19 },
    { name: 'Aries',     symbol: '♈', emoji: '🐏', dates: 'Mar 21 – Apr 19',  startM:  3, startD: 21 },
    { name: 'Taurus',    symbol: '♉', emoji: '🐂', dates: 'Apr 20 – May 20',  startM:  4, startD: 20 },
    { name: 'Gemini',    symbol: '♊', emoji: '👬', dates: 'May 21 – Jun 20',  startM:  5, startD: 21 },
    { name: 'Cancer',    symbol: '♋', emoji: '🦀', dates: 'Jun 21 – Jul 22',  startM:  6, startD: 21 },
    { name: 'Leo',       symbol: '♌', emoji: '🦁', dates: 'Jul 23 – Aug 22',  startM:  7, startD: 23 },
    { name: 'Virgo',     symbol: '♍', emoji: '👧', dates: 'Aug 23 – Sep 22',  startM:  8, startD: 23 },
    { name: 'Libra',     symbol: '♎', emoji: '⚖️', dates: 'Sep 23 – Oct 22',  startM:  9, startD: 23 },
    { name: 'Scorpio',   symbol: '♏', emoji: '🦂', dates: 'Oct 23 – Nov 21',  startM: 10, startD: 23 },
    { name: 'Sagittarius', symbol: '♐', emoji: '🏹', dates: 'Nov 22 – Dec 21', startM: 11, startD: 22 },
  ];

  /**
   * Returns the zodiac sign data for a given month and day.
   * @param {number} month — 1-indexed
   * @param {number} day
   * @returns {ZodiacSign}
   */
  const getSign = (month, day) => {
    // Encode as MMDD for easy comparison
    const md = month * 100 + day;

    if (md >= 1222 || md <= 119)  return SIGNS[0];  // Capricorn
    if (md >= 120  && md <= 218)  return SIGNS[1];  // Aquarius
    if (md >= 219  && md <= 320)  return SIGNS[2];  // Pisces
    if (md >= 321  && md <= 419)  return SIGNS[3];  // Aries
    if (md >= 420  && md <= 520)  return SIGNS[4];  // Taurus
    if (md >= 521  && md <= 620)  return SIGNS[5];  // Gemini
    if (md >= 621  && md <= 722)  return SIGNS[6];  // Cancer
    if (md >= 723  && md <= 822)  return SIGNS[7];  // Leo
    if (md >= 823  && md <= 922)  return SIGNS[8];  // Virgo
    if (md >= 923  && md <= 1022) return SIGNS[9];  // Libra
    if (md >= 1023 && md <= 1121) return SIGNS[10]; // Scorpio
    if (md >= 1122 && md <= 1221) return SIGNS[11]; // Sagittarius

    return SIGNS[0]; // fallback
  };

  return { getSign };

})();


/* ═══════════════════════════════════════════════════════════════
   MODULE 3: DATE UTILITIES
═══════════════════════════════════════════════════════════════ */
const DateUtils = (() => {

  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const DAY_NAMES = [
    'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
  ];

  /**
   * Returns the day-of-week name for a given date.
   */
  const getDayName = (year, month, day) => {
    const d = new Date(year, month - 1, day);
    return DAY_NAMES[d.getDay()];
  };

  /**
   * Returns the ordinal suffix for a number (1st, 2nd, 3rd, etc.)
   */
  const ordinal = (n) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  /**
   * Formats a date beautifully.
   * @returns {{ dayOfWeek: string, formatted: string, iso: string }}
   */
  const format = (year, month, day) => ({
    dayOfWeek: getDayName(year, month, day),
    formatted:  `${MONTH_NAMES[month - 1]} ${ordinal(day)}, ${year}`,
    iso:        `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`,
  });

  /**
   * Calculates the current age as of today.
   * @param {number} birthYear
   * @param {number} birthMonth — 1-indexed
   * @param {number} birthDay
   * @returns {{ years: number, hadBirthdayThisYear: boolean }}
   */
  const calcAge = (birthYear, birthMonth, birthDay) => {
    const today = new Date();
    let age = today.getFullYear() - birthYear;
    const hadBirthday =
      today.getMonth() + 1 > birthMonth ||
      (today.getMonth() + 1 === birthMonth && today.getDate() >= birthDay);
    if (!hadBirthday) age--;
    return { years: age, hadBirthdayThisYear: hadBirthday };
  };

  /**
   * Returns days until the next birthday.
   * @returns {{ days: number, isToday: boolean }}
   */
  const daysUntilBirthday = (birthMonth, birthDay) => {
    const today = new Date();
    const thisYear = today.getFullYear();

    let next = new Date(thisYear, birthMonth - 1, birthDay);
    if (next < today) {
      next = new Date(thisYear + 1, birthMonth - 1, birthDay);
    }

    const diff = Math.ceil((next - today) / (1000 * 60 * 60 * 24));
    return { days: diff, isToday: diff === 0 };
  };

  return { format, calcAge, daysUntilBirthday, MONTH_NAMES };

})();


/* ═══════════════════════════════════════════════════════════════
   MODULE 4: SOUND ENGINE
═══════════════════════════════════════════════════════════════ */
const SoundEngine = (() => {
  let enabled = true;
  let ctx = null;

  const getCtx = () => {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  };

  /**
   * Plays a short tone.
   * @param {number} frequency — Hz
   * @param {number} duration  — seconds
   * @param {'sine'|'square'|'triangle'|'sawtooth'} type
   * @param {number} [gain=0.12]
   */
  const playTone = (frequency, duration, type = 'sine', gain = 0.12) => {
    if (!enabled) return;
    try {
      const ac = getCtx();
      if (ac.state === 'suspended') ac.resume();

      const osc = ac.createOscillator();
      const gainNode = ac.createGain();

      osc.connect(gainNode);
      gainNode.connect(ac.destination);

      osc.type = type;
      osc.frequency.setValueAtTime(frequency, ac.currentTime);

      gainNode.gain.setValueAtTime(0, ac.currentTime);
      gainNode.gain.linearRampToValueAtTime(gain, ac.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);

      osc.start(ac.currentTime);
      osc.stop(ac.currentTime + duration + 0.05);
    } catch (_) {
      // Silently fail if AudioContext unavailable
    }
  };

  const playSuccess = () => {
    playTone(523.25, 0.12, 'sine', 0.10); // C5
    setTimeout(() => playTone(659.25, 0.10, 'sine', 0.08), 80); // E5
    setTimeout(() => playTone(783.99, 0.18, 'sine', 0.10), 160); // G5
  };

  const playError = () => {
    playTone(220, 0.08, 'square', 0.06);
    setTimeout(() => playTone(180, 0.15, 'square', 0.05), 100);
  };

  const playClick = () => {
    playTone(800, 0.04, 'sine', 0.06);
  };

  const toggle = () => {
    enabled = !enabled;
    return enabled;
  };

  const isEnabled = () => enabled;

  return { playSuccess, playError, playClick, toggle, isEnabled };

})();


/* ═══════════════════════════════════════════════════════════════
   MODULE 5: UI CONTROLLER
═══════════════════════════════════════════════════════════════ */
const UIController = (() => {

  // ── DOM References ──────────────────────────────────────
  const $ = (id) => document.getElementById(id);

  const els = {
    nicInput:        $('nic-input'),
    inputWrapper:    $('input-wrapper'),
    inputCard:       document.querySelector('.input-card'),
    inputStatus:     $('input-status'),
    decodeBtn:       $('decode-btn'),
    resetBtn:        $('reset-btn'),
    scanBtn:         $('scan-btn'),
    soundToggle:     $('sound-toggle'),
    soundOnIcon:     $('sound-on-icon'),
    soundOffIcon:    $('sound-off-icon'),
    themeInfoBtn:    $('theme-info-btn'),
    resultsSection:  $('results-section'),
    formatIndicator: $('format-indicator'),
    resultsNicValue: $('results-nic-value'),
    resultsHeader:   document.querySelector('.results-header'),
    // DOB Card
    dobDayOfWeek:    $('dob-day-of-week'),
    dobMain:         $('dob-main'),
    dobSub:          $('dob-sub'),
    birthdayDays:    $('birthday-days'),
    // Gender
    genderIcon:      $('gender-icon'),
    genderValue:     $('gender-value'),
    // Age
    ageValue:        $('age-value'),
    ageSub:          $('age-sub'),
    // Voting
    votingBadge:     $('voting-badge'),
    votingDesc:      $('voting-desc'),
    // Zodiac
    zodiacSymbol:    $('zodiac-symbol'),
    zodiacName:      $('zodiac-name'),
    zodiacDates:     $('zodiac-dates'),
    // Toast
    toast:           $('toast'),
    toastMessage:    $('toast-message'),
    // Modal
    infoModal:       $('info-modal'),
    modalClose:      $('modal-close'),
    // Bento cards
    bentoCards:      document.querySelectorAll('.bento-card'),
    resetBtnEl:      $('reset-btn'),
  };

  let toastTimer = null;

  // ── Toast Notification ──────────────────────────────────
  const showToast = (message, duration = 3500) => {
    if (toastTimer) clearTimeout(toastTimer);
    els.toastMessage.textContent = message;
    els.toast.classList.add('is-visible');
    toastTimer = setTimeout(() => {
      els.toast.classList.remove('is-visible');
    }, duration);
  };

  // ── Input Validation State ───────────────────────────────
  const setInputState = (state) => {
    // state: 'idle' | 'valid' | 'error'
    els.inputWrapper.classList.remove('is-valid', 'is-error');
    els.inputStatus.textContent = '';

    if (state === 'valid') {
      els.inputWrapper.classList.add('is-valid');
      els.inputStatus.textContent = '✓';
      els.inputStatus.style.color = 'var(--color-emerald)';
    } else if (state === 'error') {
      // Re-trigger shake animation
      void els.inputWrapper.offsetWidth; // reflow
      els.inputWrapper.classList.add('is-error');
      els.inputStatus.textContent = '✗';
      els.inputStatus.style.color = 'var(--color-error)';
    } else {
      els.inputStatus.style.color = '';
    }
  };

  // ── Populate Result Cards ────────────────────────────────
  const populateResults = (data) => {
    const { year, month, day, gender, votingEligible, format, nic } = data;

    // Format indicator
    els.resultsNicValue.textContent = nic;
    if (format === 'OLD') {
      els.formatIndicator.textContent = '🔖 Old Format';
      els.formatIndicator.className = 'format-indicator old-format';
    } else {
      els.formatIndicator.textContent = '🆕 New Format';
      els.formatIndicator.className = 'format-indicator new-format';
    }

    // ── Card 1: Date of Birth ──────────────────────────────
    const dateInfo = DateUtils.format(year, month, day);
    els.dobDayOfWeek.textContent = dateInfo.dayOfWeek;
    els.dobMain.textContent      = dateInfo.formatted;
    els.dobSub.textContent       = `Born ${year} · Day #${month * 100 + day}`;

    const birthday = DateUtils.daysUntilBirthday(month, day);
    if (birthday.isToday) {
      els.birthdayDays.textContent = '🎉 Today!';
    } else {
      els.birthdayDays.textContent = `${birthday.days} day${birthday.days !== 1 ? 's' : ''} away`;
    }

    // ── Card 2: Gender ─────────────────────────────────────
    const isMale = gender === 'Male';
    els.genderIcon.textContent  = isMale ? '♂' : '♀';
    els.genderValue.textContent = gender;
    els.genderValue.className   = `gender-value ${isMale ? 'male' : 'female'}`;
    els.genderIcon.style.color  = isMale ? '#60A5FA' : '#F472B6';

    // ── Card 3: Age ────────────────────────────────────────
    const age = DateUtils.calcAge(year, month, day);
    els.ageValue.textContent = age.years;
    els.ageSub.textContent   = age.hadBirthdayThisYear
      ? `Years old (b-day passed)`
      : `Years old (b-day upcoming)`;

    // ── Card 4: Voting Status ──────────────────────────────
    if (votingEligible) {
      els.votingBadge.textContent = 'Active';
      els.votingBadge.className   = 'voting-badge active';
      els.votingDesc.textContent  = format === 'NEW'
        ? 'New format NIC holders are eligible to vote.'
        : 'Suffix "V" — registered voter.';
    } else {
      els.votingBadge.textContent = 'Inactive';
      els.votingBadge.className   = 'voting-badge inactive';
      els.votingDesc.textContent  = 'Suffix "X" — not registered to vote.';
    }

    // ── Card 5: Zodiac Sign ────────────────────────────────
    const zodiac = ZodiacEngine.getSign(month, day);
    els.zodiacSymbol.textContent = zodiac.emoji;
    els.zodiacName.textContent   = zodiac.name;
    els.zodiacDates.textContent  = zodiac.dates;
  };

  // ── Show Results with Staggered Animation ───────────────
  const showResults = (data) => {
    populateResults(data);

    // Ensure results section is visible
    els.resultsSection.removeAttribute('hidden');

    // Scroll to results smoothly
    setTimeout(() => {
      els.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);

    // Animate results header
    setTimeout(() => {
      els.resultsHeader.classList.add('is-visible');
    }, 100);

    // Stagger bento cards
    const staggerDelays = [180, 260, 340, 420, 420]; // ms per card
    // Cards order: dob (index 0), gender (1), age (2), voting (3), zodiac (4)
    // But layout: dob is full width (card index 0), then pairs
    els.bentoCards.forEach((card, i) => {
      card.classList.remove('is-visible');
      setTimeout(() => {
        card.classList.add('is-visible');
      }, staggerDelays[i] || (180 + i * 80));
    });

    // Animate reset button last
    setTimeout(() => {
      els.resetBtnEl.classList.add('is-visible');
    }, 580);
  };

  // ── Hide Results ─────────────────────────────────────────
  const hideResults = () => {
    els.resultsHeader.classList.remove('is-visible');
    els.bentoCards.forEach(card => card.classList.remove('is-visible'));
    els.resetBtnEl.classList.remove('is-visible');

    setTimeout(() => {
      els.resultsSection.setAttribute('hidden', '');
    }, 200);
  };

  // ── Input Focus States ───────────────────────────────────
  const bindInputFocus = () => {
    els.nicInput.addEventListener('focus', () => {
      els.inputCard.classList.add('is-focused');
    });
    els.nicInput.addEventListener('blur', () => {
      els.inputCard.classList.remove('is-focused');
    });
  };

  // ── Live Format Indicator while Typing ──────────────────
  const updateTypingFeedback = (value) => {
    const { valid, format } = NICParser.validate(value);
    if (value.length === 0) {
      setInputState('idle');
    } else if (valid) {
      setInputState('valid');
    } else if (value.length >= 10) {
      setInputState('error');
    } else {
      setInputState('idle');
    }
  };

  return {
    els,
    showToast,
    setInputState,
    showResults,
    hideResults,
    bindInputFocus,
    updateTypingFeedback,
  };

})();


/* ═══════════════════════════════════════════════════════════════
   MODULE 6: APP — Bootstrap & Event Binding
═══════════════════════════════════════════════════════════════ */
const App = (() => {

  const { els } = UIController;

  // ── Handle Decode Action ─────────────────────────────────
  const handleDecode = () => {
    const raw = els.nicInput.value.trim();
    const result = NICParser.decode(raw);

    if (!result.success) {
      UIController.setInputState('error');
      UIController.showToast(result.error);
      SoundEngine.playError();
      return;
    }

    UIController.setInputState('valid');
    SoundEngine.playSuccess();
    UIController.showResults(result.data);
  };

  // ── Handle Reset Action ──────────────────────────────────
  const handleReset = () => {
    SoundEngine.playClick();
    UIController.hideResults();
    UIController.setInputState('idle');
    els.nicInput.value = '';
    els.nicInput.focus();

    // Scroll back to input
    setTimeout(() => {
      document.querySelector('.input-section').scrollIntoView({
        behavior: 'smooth', block: 'start'
      });
    }, 150);
  };

  // ── Handle Scan Button (Mocked) ──────────────────────────
  const handleScan = () => {
    SoundEngine.playClick();
    UIController.showToast('📷 Camera OCR — Coming in a future update!');
  };

  // ── Toggle Sound ─────────────────────────────────────────
  const handleSoundToggle = () => {
    const nowEnabled = SoundEngine.toggle();
    els.soundToggle.setAttribute('aria-pressed', String(nowEnabled));
    els.soundOnIcon.style.display  = nowEnabled ? 'block' : 'none';
    els.soundOffIcon.style.display = nowEnabled ? 'none'  : 'block';
  };

  // ── Show/Hide Info Modal ──────────────────────────────────
  const showModal = () => {
    els.infoModal.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
    els.modalClose.focus();
  };

  const hideModal = () => {
    els.infoModal.setAttribute('hidden', '');
    document.body.style.overflow = '';
    els.themeInfoBtn.focus();
  };

  // ── Keyboard Navigation ───────────────────────────────────
  const handleKeyboard = (e) => {
    // Enter key on input → decode
    if (e.target === els.nicInput && (e.key === 'Enter' || e.key === 'NumpadEnter')) {
      e.preventDefault();
      handleDecode();
    }

    // Escape → close modal
    if (e.key === 'Escape') {
      if (!els.infoModal.hasAttribute('hidden')) {
        hideModal();
      }
    }
  };

  // ── Auto-uppercase input ─────────────────────────────────
  const handleInputChange = () => {
    const start = els.nicInput.selectionStart;
    const end   = els.nicInput.selectionEnd;
    const upper = els.nicInput.value.toUpperCase();

    if (els.nicInput.value !== upper) {
      els.nicInput.value = upper;
      els.nicInput.setSelectionRange(start, end);
    }

    UIController.updateTypingFeedback(els.nicInput.value);
  };

  // ── Bind All Events ──────────────────────────────────────
  const init = () => {
    // Input events
    els.nicInput.addEventListener('input', handleInputChange);
    els.nicInput.addEventListener('paste', () => {
      setTimeout(handleInputChange, 0);
    });

    // Focus management
    UIController.bindInputFocus();

    // Decode button
    els.decodeBtn.addEventListener('click', handleDecode);

    // Reset button
    els.resetBtn.addEventListener('click', handleReset);

    // Scan button
    els.scanBtn.addEventListener('click', handleScan);

    // Sound toggle
    els.soundToggle.addEventListener('click', handleSoundToggle);

    // Info modal
    els.themeInfoBtn.addEventListener('click', showModal);
    els.modalClose.addEventListener('click', hideModal);
    els.infoModal.addEventListener('click', (e) => {
      if (e.target === els.infoModal) hideModal();
    });

    // Global keyboard handler
    document.addEventListener('keydown', handleKeyboard);

    // Prevent zoom on double-tap (iOS)
    document.addEventListener('touchend', (e) => {
      if (e.touches.length === 0 && e.changedTouches.length === 1) {
        // Allow normal behavior
      }
    }, { passive: true });

    console.log('%c NIC Decoded ✓ %c v1.0.0 ', 
      'background:#6366F1;color:white;padding:4px 8px;border-radius:4px 0 0 4px;font-weight:bold',
      'background:#06B6D4;color:white;padding:4px 8px;border-radius:0 4px 4px 0;font-weight:bold'
    );
  };

  return { init };

})();

/* ── Bootstrap ─────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', App.init);
