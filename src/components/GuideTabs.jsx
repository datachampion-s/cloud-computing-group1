"use client";

import { useEffect, useRef, useState } from "react";
import {
  Archive,
  Check,
  Code2,
  FileArchive,
  FileCode2,
  FileText,
  RotateCcw,
  Terminal,
} from "lucide-react";

const guides = [
  {
    tab: "Before your session",
    title: "Come prepared. Start with confidence.",
    body: "Prepare your experiment before compute time begins, so your GPU session goes toward the work that matters.",
    items: [
      "Test your code with a small sample on your own device.",
      "Prepare requirements.txt and your dataset location.",
      "Add TQDM progress tracking and checkpoints.",
      "Check your session schedule and access expiry in WIB.",
    ],
    code: "# Prepare your experiment locally\npython -m venv .venv\npip install -r requirements.txt\n\n# Test the pipeline with a small dataset\npython train.py --epochs 1 --sample 100",
  },
  {
    tab: "During your session",
    title: "Your workspace, ready in the browser.",
    body: "Enter the portal with your invitation token, check the environment status, and open JupyterLab when your session is ready.",
    items: [
      "Launch JupyterLab from the portal for the current session.",
      "Dataset folders and cache files are excluded from the export.",
      "Monitor your remaining time and workspace capacity.",
      "Save checkpoints regularly throughout your session.",
    ],
    code: '# Save state so training can resume\nif (epoch + 1) % 5 == 0:\n    torch.save({\n        "epoch": epoch + 1,\n        "model": model.state_dict(),\n        "optimizer": optimizer.state_dict(),\n    }, "checkpoint.pt")',
  },
  {
    tab: "After your session",
    title: "Keep the progress. Take it with you.",
    body: "Compute environments are temporary. After your session, monitor the export and collect your research files before portal access expires.",
    items: [
      "Wait for the export to finish and files to become available.",
      "Download your notebooks, checkpoints, and research outputs.",
      "Verify your downloaded archive on your own device.",
      "Check the expiry; compute environments are not permanent.",
    ],
    code: "# Record your experiment dependencies\npip freeze > requirements.txt\n\n# Verify that your notebooks, checkpoints, and results are ready to export",
  },
];

function WorkflowScene({ active, replayKey }) {
  if (active === 0) {
    return (
      <div
        className="workflow-scene scene-before"
        key={replayKey}
        aria-hidden="true"
      >
        <div className="scene-window-bar">
          <b>local-project</b>
        </div>
        <div className="scene-files">
          <div className="scene-file file-code">
            <FileCode2 />
            <span>train.py</span>
            <small>training script</small>
          </div>
          <div className="scene-file file-req">
            <Terminal />
            <span>requirements.txt</span>
            <small>dependencies</small>
          </div>
          <div className="scene-file file-data">
            <Archive />
            <span>dataset/</span>
            <small>sample checked</small>
          </div>
        </div>
        <div className="scene-flow-line" aria-hidden="true" />
        <div className="scene-workspace">
          <div><Code2 size={17} /><strong>Prepared workspace</strong></div>
          <span><Check size={14} /> code tested locally</span>
          <span><Check size={14} /> dependencies listed</span>
          <span><Check size={14} /> data path confirmed</span>
        </div>
      </div>
    );
  }
  if (active === 1) {
    return (
      <div className="workflow-scene scene-during" key={replayKey} aria-hidden="true">
        <div className="scene-run-label">
          <span className="scene-status" /> example training run
          <span>illustrative</span>
        </div>
        <div className="epoch-track">
          {[1, 2, 3, 4, 5].map((epoch) => (
            <div key={epoch} className={`epoch epoch-${epoch}`}>
              <span>{String(epoch).padStart(2, "0")}</span>
              <small>epoch</small>
            </div>
          ))}
        </div>
        <div className="scene-save">
          <div className="save-icon"><FileText size={21} /></div>
          <div>
            <strong>checkpoint.pt</strong>
            <small>model + optimizer state</small>
          </div>
          <span className="save-check"><Check size={16} /></span>
        </div>
        <div className="scene-terminal">
          <span>›</span> training state saved as <b>checkpoint.pt</b>
        </div>
      </div>
    );
  }
  return (
    <div className="workflow-scene scene-after" key={replayKey} aria-hidden="true">
      <div className="scene-export-head">
        <div><FileArchive size={18} /><strong>Research export</strong></div>
        <span>example</span>
      </div>
      <div className="export-files">
        <div className="export-file export-notebook">
          <FileText /><span>experiment.ipynb</span><small>notebook</small>
        </div>
        <div className="export-file export-checkpoint">
          <Archive /><span>checkpoint.pt</span><small>model state</small>
        </div>
        <div className="export-file export-results">
          <FileText /><span>outputs/</span><small>results</small>
        </div>
      </div>
      <div className="archive-card">
        <Archive size={21} />
        <div><strong>research-results.zip</strong><small>ready to download</small></div>
        <Check size={17} />
      </div>
    </div>
  );
}

export default function GuideTabs() {
  const [active, setActive] = useState(0);
  const [replayKey, setReplayKey] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const experience = useRef(null);
  const guide = guides[active];
  const replay = () => setReplayKey((key) => key + 1);
  useEffect(() => {
    const node = experience.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsVisible(true);
        observer.disconnect();
      }
    }, { threshold: 0.15, rootMargin: "0px 0px -6% 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <div className={`guide-experience${isVisible ? " is-visible" : ""}`} ref={experience}>
      <div className="guide-tabs" role="tablist" aria-label="Session guide">
        {guides.map((g, i) => (
          <button
            key={g.tab}
            id={`guide-tab-${i}`}
            role="tab"
            aria-selected={i === active}
            aria-controls="guide-panel"
            tabIndex={i === active ? 0 : -1}
            onKeyDown={(event) => {
              if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const next = event.key === "Home"
                ? 0
                : event.key === "End"
                  ? 2
                  : (i + (event.key === "ArrowRight" ? 1 : 2)) % 3;
              setActive(next);
              document.getElementById(`guide-tab-${next}`)?.focus();
            }}
            onClick={() => setActive(i)}
          >
            <span className="guide-chapter-number" aria-hidden="true">0{i + 1}</span>
            <span>{g.tab}</span>
          </button>
        ))}
      </div>
      <div
        className="guide-panel"
        id="guide-panel"
        role="tabpanel"
        aria-labelledby={`guide-tab-${active}`}
        tabIndex={0}
      >
        <div className="guide-visual-column">
          <div className="guide-visual-caption">
            <span>Workflow preview · example</span>
          </div>
          <WorkflowScene active={active} replayKey={`${active}-${replayKey}`} />
          <button className="guide-replay" type="button" onClick={replay}>
            <RotateCcw size={15} /> Replay this step
          </button>
        </div>
        <div className="guide-copy" key={`copy-${active}`}>
          <span className="guide-copy-kicker">{guide.tab}</span>
          <h3>{guide.title}</h3>
          <p>{guide.body}</p>
          <ul className="check-list">
            {guide.items.map((item) => (
              <li key={item}><Check size={17} />{item}</li>
            ))}
          </ul>
          <details className="guide-code-details">
            <summary>
              <Terminal size={16} /> View example commands and code
            </summary>
            <div className="code-window">
              <div className="code-title">
                <Terminal size={15} />
                <span>research-workspace</span>
                <span>Python / shell</span>
              </div>
              <pre><code>{guide.code}</code></pre>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
