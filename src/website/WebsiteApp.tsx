import React, { useEffect, useState, useRef } from 'react';
import {
  Download,
  Play,
  BookOpen,
  HelpCircle,
  BarChart3,
  CheckCircle2,
  ExternalLink,
  ChevronDown,
  Layers,
  Settings,
  X,
  Bot,
} from 'lucide-react';
import { Scene3D } from './Scene3D';
import { Button } from '../shared/components/Button';
import { AnimatedBackground } from '../shared/components/AnimatedBackground';
import { Dock, DockItem, DockIcon, DockLabel } from '../shared/components/Dock';
import { StatusBadge } from '../shared/components/StatusBadge';

export interface WebsiteAppProps {
  reducedMotion: boolean;
  onToggleMotion: () => void;
  onOpenExtension: () => void;
  onOpenInterviewer?: () => void;
}

export const WebsiteApp: React.FC<WebsiteAppProps> = ({
  reducedMotion,
  onToggleMotion,
  onOpenExtension,
  onOpenInterviewer,
}) => {
  const [scrollProgress, setScrollProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [timestampCount, setTimestampCount] = useState('00:00');
  const [headlineRevealed, setHeadlineRevealed] = useState(false);
  const [webGLStatus, setWebGLStatus] = useState('Checking...');
  const [activeModal, setActiveModal] = useState<'privacy' | 'terms' | 'install' | null>(null);

  const stepsRef = useRef<HTMLDivElement | null>(null);
  const introRef = useRef<HTMLDivElement | null>(null);

  // 1. Text motion: Headlines reveal word by word with a masked slide-up
  useEffect(() => {
    const t = setTimeout(() => {
      setHeadlineRevealed(true);
    }, 80);
    return () => clearTimeout(t);
  }, []);

  // 2. Text motion: Sample timestamps count up once
  useEffect(() => {
    let triggered = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !triggered) {
          triggered = true;
          if (reducedMotion) {
            setTimestampCount('12:45');
            return;
          }
          const start = performance.now();
          const step = (now: number) => {
            const progress = Math.min((now - start) / 1400, 1);
            const seconds = Math.round(765 * (1 - Math.pow(1 - progress, 3)));
            const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
            const ss = String(seconds % 60).padStart(2, '0');
            setTimestampCount(`${mm}:${ss}`);
            if (progress < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }
      },
      { threshold: 0.3 }
    );

    if (introRef.current) observer.observe(introRef.current);
    return () => observer.disconnect();
  }, [reducedMotion]);

  // 3. Scroll tracking for 3D stages and sticky steps
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

  const headline = 'Ask questions about the video you are watching, and get answers from that video and your own files.';
  const headlineWords = headline.split(' ');

  const paragraphText = 'Every question you ask is saved with the video time and the topic. Later, those questions decide what the interview asks you.';
  const paragraphWords = paragraphText.split(' ');

  const STEPS = [
    { title: 'Learn', desc: 'Open any video in Chrome. The side panel follows the playback time.' },
    { title: 'Pause', desc: 'Pause the video. The last minute of transcript is attached to your question.' },
    { title: 'Ask', desc: 'Ask in plain language. Answers come from the video up to this moment and from your files.' },
    { title: 'Practice', desc: 'Interviews and assessments are built from the questions you asked.' },
    { title: 'Improve', desc: 'The report shows weak topics, the video times to rewatch, and what to study next.' },
  ];

  return (
    <div className="relative min-h-screen bg-[#0E0F12] text-[#ECEDEF] selection:bg-[#FF7A2F] selection:text-[#0E0F12]">
      {/* 3D WebGL fixed scene */}
      <Scene3D
        scrollProgress={scrollProgress}
        reducedMotion={reducedMotion}
        onStatusChange={setWebGLStatus}
      />

      {/* Debug badge (temporary, top left) */}
      {/* "DELIVER: a debug badge (temporary, top left) showing scroll progress, WebGL status and reduced-motion status" */}
      <div
        className="fixed top-3 left-3 z-50 px-2.5 py-1.5 bg-[#16181D]/90 border border-[#2A2D35] rounded-[6px] text-[11px] font-mono text-[#A0A4AE] backdrop-blur-md flex items-center gap-2 pointer-events-none"
        aria-label="Debug Info Badge"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-[#FF7A2F]" />
        <span>Scroll: {Math.round(scrollProgress * 100)}%</span>
        <span>&bull;</span>
        <span>{webGLStatus}</span>
        <span>&bull;</span>
        <span>Motion: {reducedMotion ? 'Reduced' : 'Active'}</span>
      </div>

      {/* Top Header with sliding highlight */}
      <header className="fixed top-0 left-0 right-0 z-40 h-16 bg-[#0E0F12]/85 backdrop-blur-md border-b border-[#2A2D35] px-6 flex items-center justify-between">
        <div className="w-48">
          <a href="#hero" className="font-semibold text-sm tracking-tight text-[#ECEDEF]">
            AI Learning Assistant
          </a>
        </div>

        {/* Top Navigation with sliding spring highlight */}
        <nav className="hidden md:flex items-center" aria-label="Primary Navigation">
          <AnimatedBackground
            defaultValue="#hero"
            className="bg-[#2A2D35] rounded-[6px]"
          >
            {[
              { label: 'Home', href: '#hero' },
              { label: 'How it works', href: '#steps' },
              { label: 'Supports', href: '#supports' },
              { label: 'Report', href: '#report' },
              { label: 'Install', href: '#install' },
              { label: 'FAQ', href: '#faq' },
            ].map((link) => (
              <a
                key={link.href}
                data-id={link.href}
                href={link.href}
                className="px-3 py-1.5 text-xs font-medium text-[#A0A4AE] hover:text-[#ECEDEF] transition-colors rounded-[6px]"
              >
                {link.label}
              </a>
            ))}
          </AnimatedBackground>
        </nav>

        {/* Right action controls */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onToggleMotion}
            className="px-2.5 py-1.5 text-xs font-medium rounded-[8px] border border-[#2A2D35] text-[#A0A4AE] hover:text-[#ECEDEF] hover:border-[#4A4F5C] transition-colors"
          >
            {reducedMotion ? 'Animations off' : 'Animations on'}
          </button>
          <Button
            variant="primary"
            size="sm"
            onClick={onOpenExtension}
          >
            Side Panel Simulator
          </Button>
        </div>
      </header>

      {/* HERO SECTION */}
      <section id="hero" className="relative z-10 min-h-screen flex items-center px-6 pt-24">
        <div className="max-w-[1120px] w-full mx-auto">
          <div className="max-w-[620px]">
            {/* Word by word headline reveal with masked slide-up */}
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-medium tracking-tight leading-[1.15] mb-5 text-[#ECEDEF]">
              {headlineWords.map((word, i) => (
                <span
                  key={i}
                  className="inline-block overflow-hidden align-top mr-[0.25em]"
                >
                  <span
                    className={`inline-block transition-transform duration-600 ease-out ${
                      headlineRevealed || reducedMotion ? 'translate-y-0' : 'translate-y-[105%]'
                    }`}
                    style={{ transitionDelay: reducedMotion ? '0ms' : `${i * 35}ms` }}
                  >
                    {word}
                  </span>
                </span>
              ))}
            </h1>

            <p className="text-base sm:text-lg text-[#A0A4AE] mb-8 max-w-[46ch] leading-relaxed">
              Works on videos in Chrome, plus the PDFs, slides and code you upload.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="primary"
                size="md"
                onClick={() => setActiveModal('install')}
                icon={<Download className="w-4 h-4" />}
              >
                Download the extension
              </Button>
              <Button
                variant="secondary"
                size="md"
                onClick={onOpenExtension}
              >
                Preview Side Panel
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* INTRO SCRUB & COUNT-UP */}
      <section id="intro" ref={introRef} className="relative z-10 py-[16vh] px-6">
        <div className="max-w-[1120px] mx-auto">
          <div className="max-w-[560px]">
            {/* Paragraph brightens word by word as the user scrolls */}
            <p className="text-xl sm:text-2xl leading-relaxed text-[#ECEDEF] mb-6 max-w-[34ch]">
              {paragraphWords.map((w, idx) => {
                const stepThreshold = idx / paragraphWords.length;
                const isBright = scrollProgress >= stepThreshold || reducedMotion;
                return (
                  <span
                    key={idx}
                    className={`transition-opacity duration-200 ${
                      isBright ? 'opacity-100 text-[#ECEDEF]' : 'opacity-30 text-[#A0A4AE]'
                    }`}
                  >
                    {w}{' '}
                  </span>
                );
              })}
            </p>

            {/* Sample timestamps count up once */}
            <div className="font-mono text-3xl font-medium text-[#FF7A2F] mb-1">
              {timestampCount}
            </div>
            <p className="text-xs text-[#A0A4AE]">
              Example timestamp attached to a question. Sample value.
            </p>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS (Sticky five steps: Learn, Pause, Ask, Practice, Improve) */}
      <section id="steps" ref={stepsRef} className="relative z-10 h-[500vh] p-0">
        <div className="sticky top-0 h-screen flex items-center px-6">
          <div className="max-w-[1120px] w-full mx-auto flex items-center gap-8">
            {/* Step Rail Indicator */}
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

            {/* Step content */}
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

      {/* WHAT IT WORKS WITH (videos, PDFs, slides, code) */}
      <section id="supports" className="relative z-10 py-[14vh] px-6">
        <div className="max-w-[1120px] mx-auto">
          <h2 className="text-2xl sm:text-3xl font-medium text-[#ECEDEF] mb-8">
            What it works with
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 bg-[#16181D] border border-[#2A2D35] rounded-[12px]">
              <h3 className="text-base font-medium text-[#ECEDEF] mb-2">Videos in Chrome</h3>
              <p className="text-sm text-[#A0A4AE] leading-relaxed">
                Reads captions when the page has them, or a subtitle file you upload.
              </p>
            </div>
            <div className="p-5 bg-[#16181D] border border-[#2A2D35] rounded-[12px]">
              <h3 className="text-base font-medium text-[#ECEDEF] mb-2">PDFs</h3>
              <p className="text-sm text-[#A0A4AE] leading-relaxed">
                Answers cite the page number.
              </p>
            </div>
            <div className="p-5 bg-[#16181D] border border-[#2A2D35] rounded-[12px]">
              <h3 className="text-base font-medium text-[#ECEDEF] mb-2">Slides</h3>
              <p className="text-sm text-[#A0A4AE] leading-relaxed">
                PPT and PPTX files, cited by slide number.
              </p>
            </div>
            <div className="p-5 bg-[#16181D] border border-[#2A2D35] rounded-[12px]">
              <h3 className="text-base font-medium text-[#ECEDEF] mb-2">Code</h3>
              <p className="text-sm text-[#A0A4AE] leading-relaxed">
                Explained line by line, cited by file and line range.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* HOW INTERVIEWS AND ASSESSMENTS ARE BUILT */}
      <section className="relative z-10 py-[12vh] px-6 border-t border-[#2A2D35]/50">
        <div className="max-w-[1120px] mx-auto">
          <div className="max-w-[620px]">
            <h2 className="text-2xl sm:text-3xl font-medium text-[#ECEDEF] mb-4">
              How interviews and assessments are built from your own questions
            </h2>
            <p className="text-sm sm:text-base text-[#A0A4AE] leading-relaxed mb-6">
              When you pause and ask a question during a lecture, the system marks the concept and timestamp. Later, instead of generic quiz items, the assessment generates diagnostic prompts targeting your exact moments of uncertainty.
            </p>
            <div className="p-4 bg-[#16181D] border border-[#2A2D35] rounded-[12px] flex flex-col gap-2.5 text-xs text-[#A0A4AE]">
              <div className="text-[#ECEDEF] font-medium">Question to interview pipeline:</div>
              <div>1. Learner pauses at 18:20 on learning rate oscillations.</div>
              <div>2. The topic tag and question context are logged in your local log.</div>
              <div>3. The practice engine builds diagnostic challenges comparing divergence thresholds.</div>
              <div>4. Feedback classifies your understanding into Green, Yellow, or Red mastery states.</div>
            </div>
            {onOpenInterviewer && (
              <div className="mt-5">
                <Button
                  variant="primary"
                  size="md"
                  onClick={onOpenInterviewer}
                  icon={<Bot className="w-4 h-4" />}
                >
                  Start Live AI Avatar Interview
                </Button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* CLEARLY LABELLED SAMPLE REPORT */}
      <section id="report" className="relative z-10 py-[14vh] px-6">
        <div className="max-w-[1120px] mx-auto">
          <h2 className="text-2xl sm:text-3xl font-medium text-[#ECEDEF] mb-6">
            What the final report shows
          </h2>
          <div className="p-6 bg-[#16181D] border border-[#2A2D35] rounded-[12px] max-w-[700px]">
            <div className="text-xs font-mono text-[#A0A4AE] mb-4 uppercase tracking-wider">
              Sample report. Not real data.
            </div>
            <div className="divide-y divide-[#2A2D35] text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-[160px_90px_1fr] gap-3 py-3">
                <div className="font-medium text-[#ECEDEF]">Gradient descent</div>
                <div><StatusBadge status="Green" /></div>
                <div className="text-[#A0A4AE]">Explained the update rule with a correct example.</div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[160px_90px_1fr] gap-3 py-3">
                <div className="font-medium text-[#ECEDEF]">Learning rate</div>
                <div><StatusBadge status="Yellow" /></div>
                <div className="text-[#A0A4AE]">
                  Right idea. Missed what happens when it is too high. Rewatch 18:20 to 21:05.
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[160px_90px_1fr] gap-3 py-3">
                <div className="font-medium text-[#ECEDEF]">Overfitting</div>
                <div><StatusBadge status="Red" /></div>
                <div className="text-[#A0A4AE]">Mixed it up with underfitting. Review PDF p.9 first.</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* INSTALL STEPS */}
      <section id="install" className="relative z-10 py-[14vh] px-6">
        <div className="max-w-[1120px] mx-auto">
          <div className="max-w-[560px]">
            <h2 className="text-2xl sm:text-3xl font-medium text-[#ECEDEF] mb-4">Install</h2>
            <p className="text-[#A0A4AE] text-base leading-relaxed mb-6">
              Download the zip, unzip it, open chrome://extensions, turn on Developer mode, choose Load unpacked, and select the folder.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="primary"
                size="md"
                onClick={() => setActiveModal('install')}
                icon={<Download className="w-4 h-4" />}
              >
                Download extension zip
              </Button>
              <Button
                variant="secondary"
                size="md"
                onClick={onOpenExtension}
              >
                Open Side Panel Preview
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="relative z-10 py-[12vh] px-6 border-t border-[#2A2D35]/50">
        <div className="max-w-[1120px] mx-auto">
          <div className="max-w-[700px]">
            <h2 className="text-2xl sm:text-3xl font-medium text-[#ECEDEF] mb-6">
              Frequently asked questions
            </h2>
            <div className="flex flex-col gap-3">
              {[
                {
                  q: 'Does this store or leak my API keys in extension code?',
                  a: 'Never. All model calls go through backend proxies. Extension and browser client code contain zero credentials.',
                },
                {
                  q: 'Can the assistant answer questions ahead of where I watched?',
                  a: 'By default, spoiler prevention is active. The assistant strictly answers using video timestamps up to your current point.',
                },
                {
                  q: 'What types of documents can I upload?',
                  a: 'PDF lecture notes, PowerPoint PPT and PPTX summaries, and source code files (.py, .ts, .js, .cpp).',
                },
                {
                  q: 'How does it follow video playback?',
                  a: 'The Manifest V3 content script inspects the active tab video element and reports playback position and captions to the side panel.',
                },
              ].map((item, i) => (
                <div key={i} className="p-4 bg-[#16181D] border border-[#2A2D35] rounded-[12px]">
                  <h4 className="text-sm font-medium text-[#ECEDEF] mb-1">{item.q}</h4>
                  <p className="text-xs text-[#A0A4AE] leading-relaxed">{item.a}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer id="contact" className="relative z-10 px-6 py-14 pb-36 border-t border-[#2A2D35] bg-[#0E0F12]">
        <div className="max-w-[1120px] mx-auto">
          <nav className="flex flex-wrap gap-5 text-sm mb-4" aria-label="Footer Navigation">
            <button
              type="button"
              onClick={() => setActiveModal('privacy')}
              className="text-[#A0A4AE] hover:text-[#ECEDEF]"
            >
              Privacy Policy
            </button>
            <button
              type="button"
              onClick={() => setActiveModal('terms')}
              className="text-[#A0A4AE] hover:text-[#ECEDEF]"
            >
              Terms and Conditions
            </button>
            <button
              type="button"
              onClick={() => setActiveModal('install')}
              className="text-[#A0A4AE] hover:text-[#ECEDEF]"
            >
              Install guide
            </button>
            <a href="mailto:[CONTACT EMAIL]" className="text-[#A0A4AE] hover:text-[#ECEDEF]">
              Contact
            </a>
          </nav>
          <div className="text-xs text-[#A0A4AE]">
            [COMPANY LEGAL NAME]. Preview page. Legal pages and contact details are placeholders.
          </div>
        </div>
      </footer>

      {/* BOTTOM FLOATING DOCK */}
      {/* "Navigation: bottom floating dock whose icons magnify on hover with label tooltips (motion-primitives Dock API: Dock, DockItem, DockLabel, DockIcon). Dock items are rounded squares, not circles." */}
      <Dock>
        <DockItem href="#hero" aria-label="Home">
          <DockIcon><Play className="w-4 h-4" /></DockIcon>
          <DockLabel>Home</DockLabel>
        </DockItem>

        <DockItem href="#steps" aria-label="How it works">
          <DockIcon><BookOpen className="w-4 h-4" /></DockIcon>
          <DockLabel>How it works</DockLabel>
        </DockItem>

        <DockItem href="#supports" aria-label="Supports">
          <DockIcon><Layers className="w-4 h-4" /></DockIcon>
          <DockLabel>Supports</DockLabel>
        </DockItem>

        <DockItem onClick={onOpenExtension} aria-label="Side Panel Simulator">
          <DockIcon><HelpCircle className="w-4 h-4 text-[#FF7A2F]" /></DockIcon>
          <DockLabel>Side Panel</DockLabel>
        </DockItem>

        {onOpenInterviewer && (
          <DockItem onClick={onOpenInterviewer} aria-label="AI Avatar Interviewer">
            <DockIcon><Bot className="w-4 h-4 text-orange-400" /></DockIcon>
            <DockLabel>Avatar Interview</DockLabel>
          </DockItem>
        )}

        <DockItem href="#report" aria-label="Sample Report">
          <DockIcon><BarChart3 className="w-4 h-4" /></DockIcon>
          <DockLabel>Sample Report</DockLabel>
        </DockItem>

        <DockItem onClick={() => setActiveModal('install')} aria-label="Download Extension">
          <DockIcon><Download className="w-4 h-4 text-[#FF7A2F]" /></DockIcon>
          <DockLabel>Download Zip</DockLabel>
        </DockItem>
      </Dock>

      {/* LEGAL & INSTALL MODALS */}
      {activeModal && (
        <div className="fixed inset-0 z-50 bg-[#0E0F12]/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-[#16181D] border border-[#2A2D35] rounded-[12px] p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-[#2A2D35] pb-3">
              <h3 className="text-base font-medium text-[#ECEDEF]">
                {activeModal === 'privacy'
                  ? 'Privacy Policy'
                  : activeModal === 'terms'
                  ? 'Terms and Conditions'
                  : 'Extension Installation Guide'}
              </h3>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="text-[#A0A4AE] hover:text-[#ECEDEF] p-1"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-[#A0A4AE] leading-relaxed max-h-[60vh] overflow-y-auto space-y-3">
              {activeModal === 'privacy' ? (
                <>
                  <p>
                    [COMPANY LEGAL NAME] handles your learning logs, timestamps, and uploaded study files strictly within your session.
                  </p>
                  <p>
                    All natural language questions and materials are transmitted through secure backend channels without exposing user credentials or third-party tracking.
                  </p>
                  <p>Placeholder document for phase 1 preview.</p>
                </>
              ) : activeModal === 'terms' ? (
                <>
                  <p>
                    Use of AI Learning Assistant is provided as an educational companion for Chrome video learning.
                  </p>
                  <p>
                    Learners are responsible for the copyright compliance of documents uploaded into the assistant.
                  </p>
                  <p>Placeholder terms for phase 1 preview.</p>
                </>
              ) : (
                <>
                  <p className="font-medium text-[#ECEDEF]">Step-by-step installation in Google Chrome:</p>
                  <ol className="list-decimal list-inside space-y-2">
                    <li>Download the extension archive via the button below.</li>
                    <li>Unzip the archive to a folder on your computer.</li>
                    <li>Open Chrome and navigate to <span className="font-mono text-[#ECEDEF]">chrome://extensions</span>.</li>
                    <li>Turn on <span className="font-medium text-[#ECEDEF]">Developer mode</span> in the top-right corner.</li>
                    <li>Click <span className="font-medium text-[#ECEDEF]">Load unpacked</span> and choose the folder.</li>
                    <li>Open any educational video and click the extension icon to launch the side panel.</li>
                  </ol>
                  <div className="pt-2">
                    <a
                      href="/api/download-extension"
                      download="ai-learning-assistant-extension.zip"
                      className="btn-primary text-xs"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download .zip file
                    </a>
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-[#2A2D35]">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setActiveModal(null)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
