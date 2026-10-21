import React, { useEffect, useState, useRef } from 'react';
import { Download, ExternalLink, Play, BookOpen, HelpCircle, BarChart3, Settings } from 'lucide-react';
import { ThreeCanvas } from './ThreeCanvas';

interface MarketingSiteProps {
  reducedMotion: boolean;
  onToggleMotion: () => void;
  onOpenSimulator: () => void;
  onDownloadExtension: () => void;
}

const STEPS = [
  { title: 'Learn', desc: 'Open any video in Chrome. The side panel follows the playback time.' },
  { title: 'Pause', desc: 'Pause the video. The last minute of transcript is attached to your question.' },
  { title: 'Ask', desc: 'Ask in plain language. Answers come from the video up to this moment and from your files.' },
  { title: 'Practice', desc: 'Interviews and assessments are built from the questions you asked.' },
  { title: 'Improve', desc: 'The report shows weak topics, the video times to rewatch, and what to study next.' },
];

export const MarketingSite: React.FC<MarketingSiteProps> = ({
  reducedMotion,
  onToggleMotion,
  onOpenSimulator,
  onDownloadExtension,
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [timestampDisplay, setTimestampDisplay] = useState('00:00');
  const [activeTab, setActiveTab] = useState('Home');
  const [headlineIn, setHeadlineIn] = useState(false);

  const stepsRef = useRef<HTMLDivElement | null>(null);
  const introRef = useRef<HTMLDivElement | null>(null);

  // Headline word reveal animation trigger
  useEffect(() => {
    const timer = setTimeout(() => {
      setHeadlineIn(true);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Timestamp count-up observer
  useEffect(() => {
    let done = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !done) {
          done = true;
          if (reducedMotion) {
            setTimestampDisplay('12:45');
            return;
          }
          const t0 = performance.now();
          const tick = (now: number) => {
            const k = Math.min((now - t0) / 1400, 1);
            const v = Math.round(765 * (1 - Math.pow(1 - k, 3)));
            const mins = String(Math.floor(v / 60)).padStart(2, '0');
            const secs = String(v % 60).padStart(2, '0');
            setTimestampDisplay(`${mins}:${secs}`);
            if (k < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.3 }
    );

    if (introRef.current) observer.observe(introRef.current);
    return () => observer.disconnect();
  }, [reducedMotion]);

  // Scroll reading for steps and 3D camera
  useEffect(() => {
    const handleScroll = () => {
      if (!stepsRef.current) return;
      const top = stepsRef.current.offsetTop;
      const len = stepsRef.current.offsetHeight - window.innerHeight;
      const progress = Math.max(0, Math.min(1, (window.scrollY - top) / (len > 0 ? len : 1)));
      setScrollProgress(progress);
      setCurrentStep(Math.min(4, Math.floor(progress * 5)));
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const headlineText = 'Ask questions about the video you are watching, and get answers from that video and your own files.';
  const headlineWords = headlineText.split(' ');

  const scrubText = 'Every question you ask is saved with the video time and the topic. Later, those questions decide what the interview asks you.';
  const scrubWords = scrubText.split(' ');

  return (
    <div className="relative min-h-screen text-[#ECEDEF] bg-[#0E0F12]">
      {/* 3D WebGL background */}
      <ThreeCanvas reducedMotion={reducedMotion} scrollProgress={scrollProgress} />

      {/* Top Header */}
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-3.5 bg-[#0E0F12]/90 backdrop-blur-md border-b border-[#2A2D35]">
        <a href="#hero" className="font-semibold text-base tracking-tight text-[#ECEDEF]">
          AI Learning Assistant
        </a>

        <nav className="hidden md:flex items-center gap-1 bg-[#16181D] p-1 rounded-lg border border-[#2A2D35]" aria-label="Main Navigation">
          {['Home', 'How it works', 'Supports', 'Report', 'Install'].map((tab) => {
            const href = tab === 'Home' ? '#hero' : tab === 'How it works' ? '#steps' : `#${tab.toLowerCase()}`;
            const isActive = activeTab === tab;
            return (
              <a
                key={tab}
                href={href}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  isActive ? 'bg-[#2A2D35] text-[#ECEDEF]' : 'text-[#A0A4AE] hover:text-[#ECEDEF]'
                }`}
              >
                {tab}
              </a>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleMotion}
            className="px-3 py-1.5 text-xs font-medium rounded-[8px] border border-[#2A2D35] bg-transparent text-[#ECEDEF] hover:border-[#4A4F5C] transition-colors"
          >
            {reducedMotion ? 'Animations off' : 'Animations on'}
          </button>
          <button
            type="button"
            onClick={onOpenSimulator}
            className="btn-primary text-xs px-3 py-1.5"
          >
            Open Web Companion
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section id="hero" className="relative z-10 min-h-screen flex items-center px-6 pt-24">
        <div className="max-w-[1120px] w-full mx-auto">
          <div className="max-w-[620px]">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-medium tracking-tight leading-[1.15] mb-5">
              {headlineWords.map((word, i) => (
                <span key={i} className="inline-block overflow-hidden align-top mr-[0.25em]">
                  <span
                    className={`inline-block transition-transform duration-600 ease-out ${
                      headlineIn || reducedMotion ? 'translate-y-0' : 'translate-y-[105%]'
                    }`}
                    style={{ transitionDelay: reducedMotion ? '0ms' : `${i * 35}ms` }}
                  >
                    {word}
                  </span>
                </span>
              ))}
            </h1>

            <p className="text-base sm:text-lg text-[#A0A4AE] mb-7 max-w-[46ch]">
              Works on videos in Chrome, plus the PDFs, slides and code you upload.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onDownloadExtension}
                className="btn-primary"
              >
                <Download className="w-4 h-4" />
                Download the extension
              </button>
              <button
                type="button"
                onClick={onOpenSimulator}
                className="btn-secondary"
              >
                Try In-Browser Companion
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Intro Section */}
      <section id="intro" ref={introRef} className="relative z-10 py-[16vh] px-6">
        <div className="max-w-[1120px] mx-auto">
          <div className="max-w-[560px]">
            <p className="text-xl sm:text-2xl leading-relaxed text-[#ECEDEF] mb-6 max-w-[34ch]">
              {scrubWords.map((w, idx) => (
                <span key={idx} className="opacity-90 transition-opacity">
                  {w}{' '}
                </span>
              ))}
            </p>
            <div className="font-mono text-3xl font-medium text-[#FF7A2F] mb-1">
              {timestampDisplay}
            </div>
            <p className="text-xs text-[#A0A4AE]">
              Example timestamp attached to a question. Sample value.
            </p>
          </div>
        </div>
      </section>

      {/* Steps Sticky Section */}
      <section id="steps" ref={stepsRef} className="relative z-10 h-[500vh] p-0">
        <div className="sticky top-0 h-screen flex items-center px-6">
          <div className="max-w-[1120px] w-full mx-auto flex items-center gap-8">
            {/* Rail Indicator */}
            <div className="flex flex-col gap-2.5">
              {[0, 1, 2, 3, 4].map((stepIdx) => (
                <span
                  key={stepIdx}
                  className={`block w-[3px] h-10 rounded-[2px] transition-colors duration-250 ${
                    currentStep === stepIdx ? 'bg-[#FF7A2F]' : 'bg-[#2A2D35]'
                  }`}
                />
              ))}
            </div>

            {/* Step Content */}
            <div className="max-w-[520px]">
              <div className="font-mono text-xs text-[#A0A4AE] mb-2">
                {currentStep + 1} of 5
              </div>
              <h2 className="text-2xl sm:text-3xl font-medium text-[#ECEDEF] mb-3">
                {STEPS[currentStep].title}
              </h2>
              <p className="text-[#A0A4AE] text-base min-h-[5em] leading-relaxed">
                {STEPS[currentStep].desc}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* What it works with */}
      <section id="supports" className="relative z-10 py-[14vh] px-6">
        <div className="max-w-[1120px] mx-auto">
          <h2 className="text-2xl sm:text-3xl font-medium text-[#ECEDEF] mb-8">
            What it works with
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card-frame p-5">
              <h3 className="text-base font-medium text-[#ECEDEF] mb-2">Videos in Chrome</h3>
              <p className="text-sm text-[#A0A4AE]">
                Reads captions when the page has them, or a subtitle file you upload.
              </p>
            </div>
            <div className="card-frame p-5">
              <h3 className="text-base font-medium text-[#ECEDEF] mb-2">PDFs</h3>
              <p className="text-sm text-[#A0A4AE]">
                Answers cite the page number.
              </p>
            </div>
            <div className="card-frame p-5">
              <h3 className="text-base font-medium text-[#ECEDEF] mb-2">Slides</h3>
              <p className="text-sm text-[#A0A4AE]">
                PPT and PPTX files, cited by slide number.
              </p>
            </div>
            <div className="card-frame p-5">
              <h3 className="text-base font-medium text-[#ECEDEF] mb-2">Code</h3>
              <p className="text-sm text-[#A0A4AE]">
                Explained line by line, cited by file and line range.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Report Section */}
      <section id="report" className="relative z-10 py-[14vh] px-6">
        <div className="max-w-[1120px] mx-auto">
          <h2 className="text-2xl sm:text-3xl font-medium text-[#ECEDEF] mb-6">
            What the final report shows
          </h2>
          <div className="card-frame p-6 max-w-[700px]">
            <div className="text-xs text-[#A0A4AE] mb-4">Sample report. Not real data.</div>
            <div className="divide-y divide-[#2A2D35] text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-[160px_80px_1fr] gap-3 py-3">
                <div className="font-medium text-[#ECEDEF]">Gradient descent</div>
                <div className="text-[#3FB67A] font-medium">Green</div>
                <div className="text-[#A0A4AE]">Explained the update rule with a correct example.</div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[160px_80px_1fr] gap-3 py-3">
                <div className="font-medium text-[#ECEDEF]">Learning rate</div>
                <div className="text-[#E0A93B] font-medium">Yellow</div>
                <div className="text-[#A0A4AE]">
                  Right idea. Missed what happens when it is too high. Rewatch 18:20 to 21:05.
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[160px_80px_1fr] gap-3 py-3">
                <div className="font-medium text-[#ECEDEF]">Overfitting</div>
                <div className="text-[#E5534B] font-medium">Red</div>
                <div className="text-[#A0A4AE]">Mixed it up with underfitting. Review PDF p.9 first.</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Install Section */}
      <section id="install" className="relative z-10 py-[14vh] px-6">
        <div className="max-w-[1120px] mx-auto">
          <div className="max-w-[560px]">
            <h2 className="text-2xl sm:text-3xl font-medium text-[#ECEDEF] mb-4">Install</h2>
            <p className="text-[#A0A4AE] text-base leading-relaxed mb-6">
              Download the zip, unzip it, open chrome://extensions, turn on Developer mode, choose Load unpacked, and select the folder.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onDownloadExtension}
                className="btn-primary"
              >
                <Download className="w-4 h-4" />
                Download extension zip
              </button>
              <button
                type="button"
                onClick={onOpenSimulator}
                className="btn-secondary"
              >
                Launch Web Companion
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer id="contact" className="relative z-10 px-6 py-12 pb-32 border-t border-[#2A2D35] bg-[#0E0F12]">
        <div className="max-w-[1120px] mx-auto">
          <nav className="flex flex-wrap gap-5 text-sm mb-4" aria-label="Footer">
            <a href="#privacy" id="privacy" className="text-[#A0A4AE] hover:text-[#ECEDEF]">
              Privacy Policy
            </a>
            <a href="#terms" id="terms" className="text-[#A0A4AE] hover:text-[#ECEDEF]">
              Terms and Conditions
            </a>
            <a href="#install" className="text-[#A0A4AE] hover:text-[#ECEDEF]">
              Install guide
            </a>
            <a href="mailto:[CONTACT EMAIL]" className="text-[#A0A4AE] hover:text-[#ECEDEF]">
              Contact
            </a>
          </nav>
          <div className="text-xs text-[#A0A4AE]">
            [COMPANY LEGAL NAME]. Preview page. Legal pages and contact details are placeholders.
          </div>
        </div>
      </footer>

      {/* Bottom Floating Dock */}
      <nav
        id="dock"
        aria-label="Quick links"
        className="fixed left-1/2 bottom-4 -translate-x-1/2 z-50 flex items-center gap-2 p-2 bg-[#16181D]/95 border border-[#2A2D35] rounded-xl shadow-lg"
      >
        <a
          href="#hero"
          className="group relative w-11 h-11 rounded-[8px] bg-[#2A2D35] text-[#ECEDEF] flex items-center justify-center hover:bg-[#373B46] transition-colors"
          aria-label="Home"
        >
          <span className="absolute bottom-full mb-2 px-2 py-1 bg-[#16181D] border border-[#2A2D35] text-xs text-[#ECEDEF] rounded whitespace-nowrap opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity pointer-events-none">
            Home
          </span>
          <Play className="w-4 h-4" />
        </a>

        <a
          href="#steps"
          className="group relative w-11 h-11 rounded-[8px] bg-[#2A2D35] text-[#ECEDEF] flex items-center justify-center hover:bg-[#373B46] transition-colors"
          aria-label="How it works"
        >
          <span className="absolute bottom-full mb-2 px-2 py-1 bg-[#16181D] border border-[#2A2D35] text-xs text-[#ECEDEF] rounded whitespace-nowrap opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity pointer-events-none">
            How it works
          </span>
          <BookOpen className="w-4 h-4" />
        </a>

        <a
          href="#supports"
          className="group relative w-11 h-11 rounded-[8px] bg-[#2A2D35] text-[#ECEDEF] flex items-center justify-center hover:bg-[#373B46] transition-colors"
          aria-label="Supports"
        >
          <span className="absolute bottom-full mb-2 px-2 py-1 bg-[#16181D] border border-[#2A2D35] text-xs text-[#ECEDEF] rounded whitespace-nowrap opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity pointer-events-none">
            Supports
          </span>
          <Settings className="w-4 h-4" />
        </a>

        <button
          type="button"
          onClick={onOpenSimulator}
          className="group relative w-11 h-11 rounded-[8px] bg-[#2A2D35] text-[#FF7A2F] flex items-center justify-center hover:bg-[#373B46] transition-colors"
          aria-label="Interview and Simulator"
        >
          <span className="absolute bottom-full mb-2 px-2 py-1 bg-[#16181D] border border-[#2A2D35] text-xs text-[#ECEDEF] rounded whitespace-nowrap opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity pointer-events-none">
            Interactive Companion
          </span>
          <HelpCircle className="w-4 h-4" />
        </button>

        <a
          href="#report"
          className="group relative w-11 h-11 rounded-[8px] bg-[#2A2D35] text-[#ECEDEF] flex items-center justify-center hover:bg-[#373B46] transition-colors"
          aria-label="Report"
        >
          <span className="absolute bottom-full mb-2 px-2 py-1 bg-[#16181D] border border-[#2A2D35] text-xs text-[#ECEDEF] rounded whitespace-nowrap opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity pointer-events-none">
            Report
          </span>
          <BarChart3 className="w-4 h-4" />
        </a>

        <button
          type="button"
          onClick={onDownloadExtension}
          className="group relative w-11 h-11 rounded-[8px] bg-[#FF7A2F] text-[#0E0F12] flex items-center justify-center hover:bg-[#ff8e4d] transition-colors"
          aria-label="Download Extension"
        >
          <span className="absolute bottom-full mb-2 px-2 py-1 bg-[#16181D] border border-[#2A2D35] text-xs text-[#ECEDEF] rounded whitespace-nowrap opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity pointer-events-none">
            Download Zip
          </span>
          <Download className="w-4 h-4" />
        </button>
      </nav>
    </div>
  );
};
