import { Search, Files, ScanSearch, GitCompareArrows, Network } from 'lucide-react';

const STEPS = [
  { icon: Search, label: 'Frame the question', description: 'Translate a genetics question into a focused research query.', detail: 'QUESTION → SEARCH PLAN' },
  { icon: Files, label: 'Find the sources', description: 'Retrieve scientific literature and identify relevant publications.', detail: 'LITERATURE → SOURCES' },
  { icon: ScanSearch, label: 'Verify the claims', description: 'Extract findings and check their quotations against source text.', detail: 'CLAIM → SOURCE TEXT' },
  { icon: GitCompareArrows, label: 'Compare the evidence', description: 'Examine provenance, certainty and relationships across studies.', detail: 'STUDIES → RELATIONSHIPS' },
  { icon: Network, label: 'Explore the picture', description: 'Navigate evidence and connections in a structured view.', detail: 'EVIDENCE → INSIGHT' },
];

function WorkflowGraphic({ step }: { step: number }) {
  return <div className={`workflow-graphic workflow-graphic-${step}`} aria-hidden="true">
    {step === 0 && <svg viewBox="0 0 360 180"><rect x="40" y="40" width="280" height="100" rx="14" className="graphic-frame"/><circle cx="77" cy="76" r="10" className="graphic-line"/><path d="m84 83 8 8 M110 72h130 M110 92h84" className="graphic-line"/><path d="M110 112h65" className="graphic-accent"/><circle cx="278" cy="90" r="17" className="graphic-accent"/><path d="m272 90 5 5 9-11" className="graphic-accent"/></svg>}
    {step === 1 && <svg viewBox="0 0 360 180"><path d="M180 90 89 48 M180 90 271 48 M180 90 89 134 M180 90 271 134" className="graphic-line"/><circle cx="180" cy="90" r="25" className="graphic-accent"/><circle cx="180" cy="90" r="6" className="graphic-fill"/>{([[65,28],[247,28],[65,114],[247,114]] as const).map(([x,y],i)=><g key={i} className="source-node"><rect x={x} y={y} width="48" height="40" rx="7" className="graphic-frame"/><path d={`M${x+10} ${y+14}h28 M${x+10} ${y+23}h20`} className="graphic-line"/></g>)}</svg>}
    {step === 2 && <svg viewBox="0 0 360 180"><rect x="45" y="28" width="270" height="124" rx="12" className="graphic-frame"/><path d="M73 54h95 M73 74h200 M73 94h168 M73 114h190" className="graphic-line"/><rect x="67" y="83" width="185" height="22" rx="4" className="scan-highlight"/><path d="m260 123 9 9 19-22" className="graphic-accent"/><path d="M50 42h260" className="scan-beam"/></svg>}
    {step === 3 && <svg viewBox="0 0 360 180"><rect x="35" y="30" width="125" height="120" rx="10" className="graphic-frame"/><rect x="200" y="30" width="125" height="120" rx="10" className="graphic-frame"/><path d="M55 56h80 M55 77h64 M55 98h76 M220 56h80 M220 77h64 M220 98h76" className="graphic-line"/><path d="M155 90h50" className="graphic-accent"/><circle cx="180" cy="90" r="12" className="graphic-frame"/><path d="M174 90h12" className="graphic-accent"/></svg>}
    {step === 4 && <svg viewBox="0 0 360 180"><path d="M180 90 90 45 M180 90 270 45 M180 90 75 135 M180 90 285 135 M90 45 270 45 M75 135 285 135" className="graphic-line"/>{[[180,90],[90,45],[270,45],[75,135],[285,135]].map(([x,y],i)=><circle key={i} cx={x} cy={y} r={i===0?12:7} className="graphic-node"/>)}</svg>}
  </div>;
}

export function HowItWorks() {
  return <section id="how-it-works" className="landing-section mx-auto max-w-6xl px-6 py-24 sm:py-32">
    <div className="section-heading"><span className="section-kicker">THE WORKFLOW</span><h2>From a question to <span className="neon-text">traceable evidence.</span></h2><p>Bounded AI agents and verification steps work together to turn complex literature into a navigable evidence trail.</p></div>
    <ol className="workflow-sequence mt-16">{STEPS.map((step, i) => <li key={step.label} className="workflow-row"><div className="workflow-copy"><div className="workflow-topline"><span className="workflow-icon"><step.icon size={19} aria-hidden="true" /></span><span className="step-number">STEP 0{i + 1}</span></div><h3>{step.label}</h3><p>{step.description}</p><span className="workflow-detail">{step.detail}</span></div><WorkflowGraphic step={i}/></li>)}</ol>
  </section>;
}
