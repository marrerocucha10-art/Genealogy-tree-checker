// Ava — the warm, welcoming voice of Genealogy Tree Checker.
//
// Ava greets each visitor out loud when the welcome page opens. Earlier the
// greeting fell through to the browser's default synthesizer, which sounds
// flat and robotic. This module now takes deliberate care to sound like a
// real person: it ranks every voice the browser offers, strongly preferring
// natural and neural English voices known for a friendly, warm tone, and
// then softens the delivery with a gentle pitch and an unhurried rate.
//
// The voice can never get in the way of the page: browsers without speech
// synthesis, voices that have not loaded yet, and autoplay rules that require
// a first tap all fail quietly, and the greeting is replayed after the first
// interaction when the browser blocked it.
(function avaVoiceAssistant() {
  const synthesis = window.speechSynthesis;
  if (!synthesis || typeof SpeechSynthesisUtterance !== 'function') return;

  const GREETING = 'Welcome to your family history workspace. Your family story is waiting to be rediscovered, and I will be beside you as each branch comes into focus.';

  // A calm, unhurried delivery: a touch slower than the default and a touch
  // above the middle of the pitch range keeps Ava warm and personable instead
  // of flat and mechanical.
  const AVA_PITCH = 1.1;
  const AVA_RATE = 0.92;
  const AVA_VOLUME = 1;

  // Natural and neural voices, warmest first. These are the voices that real
  // people consistently describe as friendly and human rather than robotic,
  // across Edge, Chrome, Android, Safari, and desktop platforms.
  const PREFERRED_VOICE_NAMES = [
    'Microsoft AvaMultilingual Online (Natural) - English (United States)',
    'Microsoft Ava Online (Natural) - English (United States)',
    'Microsoft Aria Online (Natural) - English (United States)',
    'Microsoft Jenny Online (Natural) - English (United States)',
    'Microsoft EmmaMultilingual Online (Natural) - English (United States)',
    'Microsoft Sonia Online (Natural) - English (United Kingdom)',
    'Microsoft Libby Online (Natural) - English (United Kingdom)',
    'Microsoft Natasha Online (Natural) - English (Australia)',
    'Google US English',
    'Google UK English Female',
    'Samantha',
    'Ava',
    'Zoe (Premium)',
    'Zoe (Enhanced)',
    'Ava (Premium)',
    'Ava (Enhanced)',
    'Allison',
    'Susan',
    'Karen',
    'Serena',
    'Kate',
    'Stephanie',
    'Tessa',
  ];

  function normalizedLanguage(language) {
    return (language || '').toLowerCase();
  }

  function isEnglishVoice(voice) {
    return normalizedLanguage(voice.lang).indexOf('en') === 0;
  }

  function isFemaleName(name) {
    return /(ava|aria|jenny|emma|sonia|libby|natasha|samantha|zoe|allison|susan|karen|serena|kate|stephanie|tessa|female|woman)/i.test(name);
  }

  // Higher score means a warmer, more human voice. Exact preferred names win
  // outright; after that, online neural and natural voices outrank enhanced
  // and premium device voices, which outrank compact and legacy synthesizers.
  function voiceScore(voice) {
    if (!isEnglishVoice(voice)) return -1;
    const name = voice.name || '';
    const exactIndex = PREFERRED_VOICE_NAMES.indexOf(name);
    if (exactIndex !== -1) return 1000 - exactIndex;

    let score = 0;
    if (/\bonline\b|\bnatural\b|\bneural\b/i.test(name)) score += 300;
    if (/\benhanced\b|\bpremium\b/i.test(name)) score += 200;
    if (isFemaleName(name)) score += 100;
    if (voice.localService) score += 20;
    if (/compact|espeak|basic/i.test(name)) score -= 200;
    if (score === 0) score = 10;
    if (score < 0) score = 1;
    return score;
  }

  function pickWarmestVoice(voices) {
    let best = null;
    let bestScore = -Infinity;
    voices.forEach((voice) => {
      const score = voiceScore(voice);
      if (score > bestScore) {
        best = voice;
        bestScore = score;
      }
    });
    // A negative score means nothing warm is available; a last-resort English
    // voice with the gentle pitch and rate still beats silence, but a browser
    // with no English voice at all stays quiet.
    return bestScore < 0 ? null : best;
  }

  let avaVoice = null;

  function refreshVoice() {
    const voices = synthesis.getVoices();
    if (!voices || !voices.length) return;
    avaVoice = pickWarmestVoice(voices) || avaVoice;
  }

  // Chrome and Edge populate the voice list asynchronously, so keep the best
  // choice up to date as voices arrive.
  refreshVoice();
  if (typeof synthesis.addEventListener === 'function') {
    synthesis.addEventListener('voiceschanged', refreshVoice);
  } else {
    synthesis.onvoiceschanged = refreshVoice;
  }

  let greeted = false;

  function speakGreeting() {
    if (greeted) return;
    refreshVoice();
    if (!avaVoice) return;

    const utterance = new SpeechSynthesisUtterance(GREETING);
    utterance.voice = avaVoice;
    utterance.lang = avaVoice.lang || 'en-US';
    utterance.pitch = AVA_PITCH;
    utterance.rate = AVA_RATE;
    utterance.volume = AVA_VOLUME;

    greeted = true;
    synthesis.cancel();
    synthesis.speak(utterance);
  }

  // Many browsers refuse to play speech before the visitor has interacted
  // with the page. Greet as soon as the voice list is ready, and if speaking
  // is blocked, greet them after their first tap or key press instead.
  function speakAfterFirstInteraction() {
    if (greeted) return;
    const greet = () => {
      try {
        speakGreeting();
      } catch (error) {
        // As above, stay silent rather than surface an error to the visitor.
      }
    };
    window.addEventListener('pointerdown', greet, { once: true });
    window.addEventListener('keydown', greet, { once: true });
  }

  try {
    speakGreeting();
    if (!greeted) {
      // Chrome and Edge can fire voiceschanged with a still-empty list, so
      // keep listening until a voice is actually found instead of giving up
      // after the first event.
      const onVoicesReady = () => {
        try {
          speakGreeting();
        } catch (error) {
          // The greeting is a courtesy; a blocked voice must never break the page.
        }
        if (greeted && typeof synthesis.removeEventListener === 'function') {
          synthesis.removeEventListener('voiceschanged', onVoicesReady);
        }
      };
      if (typeof synthesis.addEventListener === 'function') {
        synthesis.addEventListener('voiceschanged', onVoicesReady);
      }
      window.setTimeout(() => {
        if (!greeted && typeof synthesis.removeEventListener === 'function') {
          synthesis.removeEventListener('voiceschanged', onVoicesReady);
        }
        if (!greeted) speakAfterFirstInteraction();
      }, 2500);
    }
  } catch (error) {
    speakAfterFirstInteraction();
  }
}());
