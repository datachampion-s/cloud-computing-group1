import Image from "next/image";
import Link from "next/link";
import {
  Cpu,
  Monitor,
  Sparkles,
  FileText,
  CalendarCheck,
  KeyRound,
  FlaskConical,
  Download,
  Check,
  ChevronDown,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { PoweredByAWS } from "@/components/Brand";
import GuideTabs from "@/components/GuideTabs";
import SectionLink from "@/components/SectionLink";
import LandingEffects from "@/components/LandingEffects";
import "./landing.css";
export const metadata = { title: "High Compute Access for UNNES Student" };
const steps = [
  [
    FileText,
    "Share your idea",
    "Share your research or competition proposal and an estimate of your computing needs.",
  ],
  [
    CalendarCheck,
    "Find your time",
    "We review your needs and propose a timeslot for you to confirm.",
  ],
  [
    KeyRound,
    "Get your access",
    "Once your schedule is finalized, your portal access token arrives by email.",
  ],
  [
    FlaskConical,
    "Make progress",
    "Open JupyterLab during your session and focus on your experiments.",
  ],
  [
    Download,
    "Keep your results",
    "Download your notebooks, models, and outputs when the export is complete.",
  ],
];
const tips = [
  [
    "Checkpoint is your safety net.",
    "Save your model and optimizer state every few epochs or steps. When time runs out, you still have progress you can resume.",
  ],
  [
    "Test small. Train big.",
    "Run one epoch or a small sample on your own device first. Check paths, tensor shapes, and your training loop before using GPU time.",
  ],
  [
    "Bring a reproducible setup.",
    "Prepare your dependencies, random seeds, model configuration, and dataset. Spend less of your session on setup and basic debugging.",
  ],
  [
    "Leave time for your outputs.",
    "Watch the countdown and save your latest checkpoints and notebooks before the session ends.",
  ],
];
const faqs = [
  [
    "Who can apply for compute access?",
    "The initial program prioritizes UNNES Statistics students working on academic research, machine learning experiments, and data science competitions. Every application is reviewed by DCS.",
  ],
  [
    "Is compute access really free?",
    "Yes. Approved students can use the program at no cost. Capacity is limited; the GPU, session duration, and schedule are allocated by the admin according to need and availability.",
  ],
  [
    "Can I choose my own GPU?",
    "Describe your workload and compute estimate in your proposal. The admin allocates suitable resources. The time preferences in your application are not a reservation.",
  ],
  [
    "What happens when my session ends?",
    "Workload access ends at your allocated deadline. Research files are exported after the session. Dataset folders and cache files are excluded.",
  ],
  [
    "How long can I access the portal?",
    "Portal access remains available for at least seven days after your session ends. JupyterLab is available only during your approved compute timeslot. Your exact access expiry appears in the portal.",
  ],
  [
    "How should I share my application documents?",
    "Upload your student card and proposal to Google Drive. Give Viewer access to the admin email shown in the application form, then paste each file link. Keep personal documents private.",
  ],
];
export default function Landing() {
  return (
    <div className="landing-page">
      <LandingEffects />
      <Navbar hideDuringHero landing />
      <main id="main">
        <section className="hero" id="compute-hero">
          <div className="container hero-grid">
            <div className="hero-copy">
              <div className="hero-identity">
                <Image
                  src="/images/hpc-logo.png"
                  alt="DCS HPC"
                  width={90}
                  height={90}
                  priority
                />
                <span>
                  High-performance compute.
                  <br />
                  <strong>For student research.</strong>
                </span>
              </div>
              <h1>
                Big ideas deserve
                <br />
                <em>more compute.</em>
              </h1>
              <p>
                Your research shouldn’t be limited by your hardware. Get free,
                scheduled GPU access for your next discovery. The environment uses Python 3.10.
              </p>
              <div className="hero-actions">
                <Link className="button button-primary" href="/apply">
                  Apply for access
                </Link>
                <SectionLink className="text-link" href="#how-it-works">
                  How it works
                </SectionLink>
              </div>
              <div className="hero-powered">
                <PoweredByAWS />
              </div>
            </div>
            <div className="hero-visual">
              <div className="hero-orbit" />
              <Image
                src="/images/compute-cluster.png"
                alt="Illustration of a modular GPU computing cluster with blue accents"
                width={1536}
                height={1024}
                priority
                sizes="(max-width: 800px) 100vw, 55vw"
              />
            </div>
          </div>
          <div className="container value-strip">
            <div>
              <Sparkles size={21} />
              <span>
                <strong>Free access</strong>For approved research
              </span>
            </div>
            <div>
              <Cpu size={21} />
              <span>
                <strong>Dedicated GPU time</strong>Allocated around your needs
              </span>
            </div>
            <div>
              <Monitor size={21} />
              <span>
                <strong>Open your browser</strong>Your JupyterLab workspace
                awaits
              </span>
            </div>
          </div>
        </section>

        <section
          className="section workflow-section"
          id="how-it-works"
          data-reveal
        >
          <div className="container">
            <div className="workflow-layout">
              <div className="section-intro workflow-intro">
                <span className="eyebrow">FROM PROPOSAL TO PROGRESS</span>
                <h2>
                  Your idea,
                  <br />
                  <em>made possible.</em>
                </h2>
                <p>
                  Bring an experiment plan. We help make room for the computing
                  behind it.
                </p>
                <div className="workflow-time">
                  <span>Typical review</span>
                  <strong>Within 3 business days</strong>
                </div>
              </div>
              <div className="workflow" data-reveal>
                {steps.map(([Icon, title, body], i) => (
                  <article
                    key={title}
                    className={`workflow-step workflow-step-${i + 1}`}
                  >
                    <div className="step-top">
                      <span className="step-icon">
                        <Icon size={23} />
                      </span>
                      <span className="step-number">0{i + 1}</span>
                    </div>
                    <h3>{title}</h3>
                    <p>{body}</p>
                  </article>
                ))}
              </div>
              <p className="workflow-note">
                <Check size={16} />
                Proposal-based approval · Admin-allocated resources · One
                session at a time
              </p>
            </div>

            <div className="merit-callout">
              <div className="merit-callout-header">
                <span className="eyebrow">RESPONSIBLE COMPUTE ACCESS</span>
                <h3>
                  Shared resources. <em>Accountable research.</em>
                </h3>
              </div>
              <p className="merit-callout-desc">
                DCS fully sponsors exclusive GPU allocations for student
                research. Limited capacity means each approved timeslot is
                reserved for its proposed work.
              </p>
              <div className="merit-grid">
                <div className="merit-card">
                  <div className="merit-icon-wrap positive">
                    <ShieldCheck size={20} />
                  </div>
                  <div>
                    <h4>Dedicated Research Commitment</h4>
                    <p>
                      Approved allocations represent reserved cloud capacity funded for student discovery. We ask researchers to actively utilize their reserved timeslot for experiments and model training as proposed.
                    </p>
                  </div>
                </div>
                <div className="merit-card">
                  <div className="merit-icon-wrap warning">
                    <AlertTriangle size={20} />
                  </div>
                  <div>
                    <h4>Session Reliability &amp; Future Approvals</h4>
                    <p>
                      Because compute capacity is exclusive and slots are limited, unattended allocations or no-shows without prior notice directly impact participation standing and prioritization for future compute requests.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="section guide-section" id="guide" data-reveal>
          <div className="container">
            <div className="section-intro">
              <span className="eyebrow">YOUR FIRST SESSION, SIMPLIFIED</span>
              <h2>
                Less setup anxiety.
                <br />
                <em>More time to explore.</em>
              </h2>
              <p>
                A practical guide to making the most of your session, from
                preparation to saved results.
              </p>
            </div>
            <GuideTabs />
          </div>
        </section>

        <section className="section tips-section" id="tips" data-reveal>
          <div className="container tips-grid">
            <div className="tips-heading">
              <h2>
                Make every
                <br />
                <em>GPU minute</em>
                <br />
                count.
              </h2>
              <p>
                Your time is limited.
                <br />
                Your progress can last.
              </p>
              <Link href="/apply" className="text-link">
                Prepare your research application
              </Link>
            </div>
            <div className="tips-list">
              {tips.map(([title, body], i) => (
                <article key={title} className={i === 0 ? "tip-featured" : ""}>
                  <span>0{i + 1}</span>
                  <div>
                    <h3>{title}</h3>
                    <p>{body}</p>
                    {i === 0 && (
                      <div
                        className="checkpoint-cue"
                        data-reveal
                        aria-label="Train, save a checkpoint, resume from saved progress"
                      >
                        <span>Train</span>
                        <i />
                        <span>Save</span>
                        <i />
                        <span>Resume</span>
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section faq-section" id="faq" data-reveal>
          <div className="container faq-grid">
            <div>
              <h2>
                A few things
                <br />
                <em>before you begin.</em>
              </h2>
              <p>
                Still have a question?
                <br />
                <a
                  href="https://instagram.com/datachampion.s"
                  target="_blank"
                  rel="noreferrer"
                  className="text-link"
                >
                  Reach out to DCS
                </a>
              </p>
            </div>
            <div className="faq-list">
              {faqs.map(([q, a]) => (
                <details key={q}>
                  <summary>
                    {q}
                    <ChevronDown size={19} />
                  </summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="closing-section" data-reveal>
          <div className="container">
            <div className="closing">
              <div>
                <h2>
                  Your next discovery
                  <br />
                  could start <em>right here.</em>
                </h2>
                <p>Prepare your proposal. Let’s make room for your research.</p>
              </div>
              <Link href="/apply" className="button button-white">
                Apply for access
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer landing />
    </div>
  );
}
