import { useState } from 'react';
import './App.css';

function App() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [language, setLanguage] = useState('english');

  const LANGUAGES = [
    { code: 'english', label: 'English' },
    { code: 'hindi', label: 'हिंदी' },
    { code: 'tamil', label: 'தமிழ்' },
    { code: 'telugu', label: 'తెలుగు' },
    { code: 'bengali', label: 'বাংলা' },
    { code: 'marathi', label: 'मराठी' },
  ];

  const handleFile = (f) => {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      setError('File too large. Maximum size is 10MB');
      return;
    }
    setFile(f);
    setResult(null);
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target.result);
    reader.readAsDataURL(f);
  };

  const handleAnalyze = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('language', language);
    try {
      const res = await fetch('http://localhost:8000/analyze', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Server error ' + res.status);
      }
      setResult(data);
    } catch (err) {
      if (err.message.includes('fetch') || err.message.includes('connect')) {
        setError('Cannot connect to backend. Make sure it is running on port 8000.');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <span className="logo-rx">Rx</span>
            <div>
              <div className="logo-title">ClarityEngine</div>
              <div className="logo-sub">Prescription Decoder</div>
            </div>
          </div>
          <div className="lang-row">
            {LANGUAGES.map(l => (
              <button
                key={l.code}
                className={'lang-btn' + (language === l.code ? ' active' : '')}
                onClick={() => setLanguage(l.code)}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="main">
        {!result && !loading && (
          <div className="upload-page">
            <div className="hero">
              <div className="hero-badge">AI-Powered · Free · Private</div>
              <h1 className="hero-title">
                Understand Your<br />
                <span className="green">Prescription</span>
              </h1>
              <p className="hero-sub">
                Upload any doctor's prescription — handwritten or printed.<br />
                We decode it in plain language, in your language.
              </p>
            </div>

            {!preview ? (
              <label className="dropzone">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden-input"
                  onChange={(e) => handleFile(e.target.files[0])}
                />
                <div className="dz-icon">📄</div>
                <div className="dz-main">Drop prescription image here</div>
                <div className="dz-sub">or click to browse · JPG, PNG, HEIC · max 10MB</div>
              </label>
            ) : (
              <div className="preview-box">
                <img src={preview} alt="prescription" className="preview-img" />
                <div className="preview-actions">
                  <button
                    className="btn-ghost"
                    onClick={() => { setPreview(null); setFile(null); setError(null); }}
                  >
                    ✕ Remove
                  </button>
                  <button className="btn-primary" onClick={handleAnalyze} disabled={loading}>
                    ⚡ Analyze Prescription
                  </button>
                </div>
                {error && <div className="error-box">⚠ {error}</div>}
              </div>
            )}

            {error && !preview && <div className="error-box">⚠ {error}</div>}

            <div className="trust-row">
              <span>🔒 Not stored</span>
              <span>🇮🇳 Built for India</span>
              <span>⚕ Comprehension aid only</span>
            </div>
          </div>
        )}

        {loading && (
          <div className="loading-page">
            <div className="loading-ring" />
            <div className="loading-title">Analyzing prescription...</div>
            <div className="loading-steps">
              <div className="lstep active">Reading image</div>
              <div className="lstep">Decoding drugs</div>
              <div className="lstep">Checking interactions</div>
              <div className="lstep">Building schedule</div>
            </div>
          </div>
        )}

        {result && (
          <ResultView
            result={result}
            onReset={() => { setResult(null); setPreview(null); setFile(null); }}
          />
        )}
      </main>
    </div>
  );
}

function ResultView({ result, onReset }) {
  const [tab, setTab] = useState('drugs');

  return (
    <div className="result-page">
      <div className="result-topbar">
        <div className="result-meta">
          <div className="result-badge">✓ Decoded</div>
          {result.patient_name && <span className="meta-item">👤 {result.patient_name}</span>}
          {result.doctor_name && <span className="meta-item">🩺 Dr. {result.doctor_name}</span>}
          {result.analyzed_at && (
            <span className="meta-item">
              🕐 {new Date(result.analyzed_at).toLocaleTimeString()}
            </span>
          )}
        </div>
        <button className="btn-ghost" onClick={onReset}>← New Prescription</button>
      </div>

      <div className="tabs">
        {[
          { id: 'drugs', label: '💊 Medications (' + (result.drugs ? result.drugs.length : 0) + ')' },
          { id: 'schedule', label: '🕐 Schedule' },
          { id: 'interactions', label: '⚠ Interactions (' + (result.interactions ? result.interactions.length : 0) + ')' },
          { id: 'raw', label: '📝 Raw Text' },
        ].map(t => (
          <button
            key={t.id}
            className={'tab' + (tab === t.id ? ' active' : '')}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="tab-body">
        {tab === 'drugs' && (
          <div className="drugs-list">
            {(!result.drugs || result.drugs.length === 0) ? (
              <div className="empty-state">
                <div style={{ fontSize: 40 }}>🔍</div>
                <div>No medications detected. Try a clearer image.</div>
              </div>
            ) : (
              result.drugs.map((drug, i) => <DrugCard key={i} drug={drug} />)
            )}
          </div>
        )}

        {tab === 'schedule' && (
          <div className="schedule-list">
            <div className="schedule-note">📋 Take medications exactly as prescribed.</div>
            {(!result.schedule || result.schedule.length === 0) ? (
              <div className="empty-state">No schedule available.</div>
            ) : (
              result.schedule.map((s, i) => (
                <div key={i} className="schedule-item">
                  <div className="s-time">{s.time}</div>
                  <div className="s-drug">{s.drug_name}</div>
                  <div className="s-dose">{s.dosage}</div>
                  {s.instruction && <div className="s-note">{s.instruction}</div>}
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'interactions' && (
          <div className="interactions-list">
            {(!result.interactions || result.interactions.length === 0) ? (
              <div className="no-interactions">
                <div style={{ fontSize: 48 }}>✅</div>
                <div className="ni-title">No dangerous interactions found</div>
                <div className="ni-sub">Always tell your pharmacist about all medicines you take.</div>
              </div>
            ) : (
              result.interactions.map((ix, i) => (
                <div key={i} className={'ix-card sev-' + (ix.severity ? ix.severity.toLowerCase() : '')}>
                  <div className="ix-top">
                    <span className="ix-drugs">{ix.drug1} ↔ {ix.drug2}</span>
                    <span className="ix-sev">{ix.severity}</span>
                  </div>
                  <p className="ix-desc">{ix.description}</p>
                  {ix.action && <div className="ix-action">⚕ {ix.action}</div>}
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'raw' && (
          <div className="raw-box">
            <div className="raw-label">Text extracted from your prescription:</div>
            <pre className="raw-text">{result.raw_text || 'No text extracted'}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

function DrugCard({ drug }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="drug-card">
      <div className="drug-top" onClick={() => setOpen(!open)}>
        <div>
          <div className="drug-name">{drug.name}</div>
          {drug.generic_name && (
            <div className="drug-generic">Generic: {drug.generic_name}</div>
          )}
        </div>
        <span className="drug-class">{drug.drug_class || 'Medication'}</span>
      </div>
      <div className="drug-chips">
        {drug.dosage && <span className="chip">💊 {drug.dosage}</span>}
        {drug.frequency && <span className="chip">🕐 {drug.frequency}</span>}
        {drug.duration && <span className="chip">📅 {drug.duration}</span>}
        {drug.timing && <span className="chip">🍽 {drug.timing}</span>}
      </div>
      <button className="expand-btn" onClick={() => setOpen(!open)}>
        {open ? '▲ Less info' : '▼ More info'}
      </button>
      {open && (
        <div className="drug-details">
          {drug.what_it_does && (
            <Detail icon="ℹ" label="What it does" text={drug.what_it_does} />
          )}
          {drug.plain_language && (
            <Detail icon="💬" label="In simple words" text={drug.plain_language} color="green" />
          )}
          {drug.side_effects && (
            <Detail icon="⚠" label="Side effects" text={drug.side_effects} color="yellow" />
          )}
          {drug.warnings && (
            <Detail icon="🚫" label="Warnings" text={drug.warnings} color="red" />
          )}
          {drug.food_interactions && (
            <Detail icon="🍎" label="Food interactions" text={drug.food_interactions} color="blue" />
          )}
        </div>
      )}
    </div>
  );
}

function Detail({ icon, label, text, color }) {
  return (
    <div className={'detail-block' + (color ? ' ' + color : '')}>
      <div className="detail-label">{icon} {label}</div>
      <div className="detail-text">{text}</div>
    </div>
  );
}

export default App;