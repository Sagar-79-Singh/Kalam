let current: SpeechSynthesisUtterance | undefined;
let ended: (() => void) | undefined;
export function canSpeak(): boolean { return 'speechSynthesis' in window; }
export function stopSpeaking(): void { const done = ended; ended = undefined; if (canSpeak()) speechSynthesis.cancel(); current = undefined; done?.(); }
export function speak(text: string, onEnd?: () => void): void {
  stopSpeaking(); if (!canSpeak()) return;
  const plain = text.replace(/```[\s\S]*?```/g, ' Code block. ').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[#*_`>]/g, '').trim();
  current = new SpeechSynthesisUtterance(plain);
  ended = onEnd;
  const finish = () => { if (current === utterance) { current = undefined; const done = ended; ended = undefined; done?.(); } };
  const utterance = current; current.rate = 1; current.onend = finish; current.onerror = finish;
  speechSynthesis.speak(current);
}
