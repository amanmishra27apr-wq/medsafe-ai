import React, { useState, useRef, useEffect } from 'react';
import { 
  Shield, 
  Search, 
  Upload, 
  Activity, 
  AlertTriangle, 
  FileText, 
  MessageSquare, 
  History, 
  ChevronRight, 
  Plus, 
  X,
  Camera,
  Loader2,
  CheckCircle2,
  Info,
  Stethoscope,
  HeartPulse,
  Thermometer
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type } from "@google/genai";

// --- Types ---
interface Medicine {
  id: number;
  name: string;
  active_salts: string;
  common_uses: string;
  interactions: string;
}

interface InteractionResult {
  med1: string;
  med2: string;
  severity: string;
  explanation?: string;
}

interface OCRResult {
  medicines: { name: string; salt: string }[];
}

// --- Components ---

const SidebarItem = ({ icon: Icon, label, active, onClick }: { icon: any, label: string, active: boolean, onClick: () => void }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
      active 
        ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-200' 
        : 'text-slate-600 hover:bg-slate-100'
    }`}
  >
    <Icon size={20} />
    <span className="font-medium">{label}</span>
  </button>
);

const Card = ({ children, title, icon: Icon, className = "" }: { children: React.ReactNode, title?: string, icon?: any, className?: string }) => (
  <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden ${className}`}>
    {title && (
      <div className="px-6 py-4 border-bottom border-slate-50 bg-slate-50/50 flex items-center gap-2">
        {Icon && <Icon size={18} className="text-emerald-600" />}
        <h3 className="font-semibold text-slate-800">{title}</h3>
      </div>
    )}
    <div className="p-6">
      {children}
    </div>
  </div>
);

export default function App() {
  const [activeTab, setActiveTab] = useState('interactions');
  const [medList, setMedList] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Medicine[]>([]);
  const [interactions, setInteractions] = useState<InteractionResult[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);

  // OCR State
  const [ocrFile, setOcrFile] = useState<File | null>(null);
  const [ocrPreview, setOcrPreview] = useState<string | null>(null);
  const [ocrResults, setOcrResults] = useState<OCRResult | null>(null);
  const [isOcrLoading, setIsOcrLoading] = useState(false);

  // Symptom State
  const [symptomQuery, setSymptomQuery] = useState('');
  const [symptomResponse, setSymptomResponse] = useState<string | null>(null);
  const [isSymptomLoading, setIsSymptomLoading] = useState(false);

  // Side Effect State
  const [sideEffectData, setSideEffectData] = useState({
    age: '',
    gender: '',
    meds: '',
    experience: ''
  });
  const [sideEffectResponse, setSideEffectResponse] = useState<string | null>(null);
  const [isSideEffectLoading, setIsSideEffectLoading] = useState(false);

  // Emergency Risk State
  const [riskSymptoms, setRiskSymptoms] = useState<string[]>([]);
  const [riskScore, setRiskScore] = useState<{ score: number, level: string, advice: string } | null>(null);

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

  // --- Handlers ---

  const handleSearch = async (q: string) => {
    setSearchQuery(q);
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const res = await fetch(`/api/medicines?q=${q}`);
      const data = await res.json();
      setSearchResults(data);
    } catch (e) {
      console.error(e);
    }
  };

  const addMed = (name: string) => {
    if (!medList.includes(name)) {
      setMedList([...medList, name]);
    }
    setSearchQuery('');
    setSearchResults([]);
  };

  const removeMed = (name: string) => {
    setMedList(medList.filter(m => m !== name));
  };

  const checkInteractions = async () => {
    if (medList.length < 2) return;
    setIsAnalyzing(true);
    setAiExplanation(null);
    try {
      const res = await fetch('/api/check-interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meds: medList })
      });
      const data = await res.json();
      setInteractions(data.interactions);

      // AI Analysis
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analyze these medicines for potential interactions and provide a concise, educational safety note: ${medList.join(', ')}. Focus on common risks and what to watch for. Keep it non-diagnostic.`,
      });
      setAiExplanation(response.text);
    } catch (e) {
      console.error(e);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleOcr = async () => {
    if (!ocrFile) return;
    setIsOcrLoading(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(ocrFile);
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: {
            parts: [
              { inlineData: { data: base64, mimeType: ocrFile.type } },
              { text: "Extract medicine names and their active salts from this prescription. Return ONLY a JSON object with a 'medicines' array containing objects with 'name' and 'salt' keys." }
            ]
          },
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                medicines: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      salt: { type: Type.STRING }
                    }
                  }
                }
              }
            }
          }
        });
        setOcrResults(JSON.parse(response.text || '{}'));
      };
    } catch (e) {
      console.error(e);
    } finally {
      setIsOcrLoading(false);
    }
  };

  const solveSymptom = async () => {
    if (!symptomQuery) return;
    setIsSymptomLoading(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Provide educational guidance for these symptoms: "${symptomQuery}". Include: 1. Possible common causes (non-diagnostic), 2. Home remedies/lifestyle tips, 3. Warning signs when to see a doctor. Keep it structured and safe.`,
      });
      setSymptomResponse(response.text);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSymptomLoading(false);
    }
  };

  const monitorSideEffect = async () => {
    setIsSideEffectLoading(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `A ${sideEffectData.age} year old ${sideEffectData.gender} is taking ${sideEffectData.meds} and experiencing: "${sideEffectData.experience}". Provide a short, educational safety note highlighting possible factors and one clear precaution. Non-diagnostic tone.`,
      });
      setSideEffectResponse(response.text);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSideEffectLoading(false);
    }
  };

  const calculateRisk = () => {
    let score = 0;
    const highRisk = ['Chest Pain', 'Shortness of Breath', 'Severe Bleeding', 'Loss of Consciousness', 'Sudden Weakness'];
    const medRisk = ['High Fever', 'Persistent Vomiting', 'Severe Abdominal Pain', 'Confusion'];
    
    riskSymptoms.forEach(s => {
      if (highRisk.includes(s)) score += 10;
      else if (medRisk.includes(s)) score += 5;
      else score += 2;
    });

    let level = "Low";
    let advice = "Monitor symptoms and rest. Consult a doctor if they persist.";
    if (score >= 10) {
      level = "Emergency";
      advice = "Seek immediate medical attention. Call emergency services if needed.";
    } else if (score >= 5) {
      level = "Moderate";
      advice = "Schedule an urgent appointment with your healthcare provider.";
    }

    setRiskScore({ score, level, advice });
  };

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans text-slate-900">
      {/* Sidebar */}
      <aside className="w-72 bg-white border-r border-slate-200 p-6 flex flex-col gap-8">
        <div className="flex items-center gap-3 px-2">
          <div className="bg-emerald-600 p-2 rounded-lg">
            <Shield className="text-white" size={24} />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-800">MedSafe AI</h1>
        </div>

        <nav className="flex flex-col gap-2">
          <SidebarItem 
            icon={Activity} 
            label="Interaction Checker" 
            active={activeTab === 'interactions'} 
            onClick={() => setActiveTab('interactions')} 
          />
          <SidebarItem 
            icon={FileText} 
            label="Prescription OCR" 
            active={activeTab === 'ocr'} 
            onClick={() => setActiveTab('ocr')} 
          />
          <SidebarItem 
            icon={MessageSquare} 
            label="Symptom Solver" 
            active={activeTab === 'symptoms'} 
            onClick={() => setActiveTab('symptoms')} 
          />
          <SidebarItem 
            icon={History} 
            label="Side-Effect Monitor" 
            active={activeTab === 'sideeffects'} 
            onClick={() => setActiveTab('sideeffects')} 
          />
          <SidebarItem 
            icon={AlertTriangle} 
            label="Risk Predictor" 
            active={activeTab === 'risk'} 
            onClick={() => setActiveTab('risk')} 
          />
        </nav>

        <div className="mt-auto bg-emerald-50 rounded-2xl p-4 border border-emerald-100">
          <p className="text-xs text-emerald-800 font-medium mb-1">Disclaimer</p>
          <p className="text-[10px] text-emerald-700 leading-relaxed">
            MedSafe AI provides educational information only. It is not a substitute for professional medical advice, diagnosis, or treatment.
          </p>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8 lg:p-12">
        <header className="mb-10">
          <h2 className="text-3xl font-bold text-slate-900 mb-2">
            {activeTab === 'interactions' && "Medicine Interaction Checker"}
            {activeTab === 'ocr' && "Prescription Analysis"}
            {activeTab === 'symptoms' && "Symptom & Doubt Solver"}
            {activeTab === 'sideeffects' && "Side-Effect Monitor"}
            {activeTab === 'risk' && "Emergency Risk Predictor"}
          </h2>
          <p className="text-slate-500">
            {activeTab === 'interactions' && "Check potential drug-drug interactions and safety notes."}
            {activeTab === 'ocr' && "Extract medicine names and salts from prescription images."}
            {activeTab === 'symptoms' && "Get educational guidance and home remedies for your symptoms."}
            {activeTab === 'sideeffects' && "Log your experience and get AI-powered safety insights."}
            {activeTab === 'risk' && "Assess the urgency of your symptoms with rule-based scoring."}
          </p>
        </header>

        <AnimatePresence mode="wait">
          {activeTab === 'interactions' && (
            <motion.div
              key="interactions"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-8"
            >
              <div className="space-y-6">
                <Card title="Add Medicines" icon={Plus}>
                  <div className="relative mb-6">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                      type="text"
                      placeholder="Search medicine (e.g. Paracetamol)..."
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                      value={searchQuery}
                      onChange={(e) => handleSearch(e.target.value)}
                    />
                    {searchResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-10 overflow-hidden">
                        {searchResults.map(med => (
                          <button
                            key={med.id}
                            onClick={() => addMed(med.name)}
                            className="w-full px-4 py-3 text-left hover:bg-slate-50 flex items-center justify-between group"
                          >
                            <div>
                              <p className="font-medium text-slate-800">{med.name}</p>
                              <p className="text-xs text-slate-500">{med.active_salts}</p>
                            </div>
                            <Plus size={16} className="text-slate-300 group-hover:text-emerald-600" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {medList.map(med => (
                      <span key={med} className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full text-sm font-medium border border-emerald-100">
                        {med}
                        <button onClick={() => removeMed(med)} className="hover:text-emerald-900">
                          <X size={14} />
                        </button>
                      </span>
                    ))}
                    {medList.length === 0 && (
                      <p className="text-sm text-slate-400 italic">No medicines added yet.</p>
                    )}
                  </div>

                  <button
                    disabled={medList.length < 2 || isAnalyzing}
                    onClick={checkInteractions}
                    className="w-full mt-8 py-3 bg-emerald-600 text-white rounded-xl font-semibold shadow-lg shadow-emerald-200 hover:bg-emerald-700 disabled:opacity-50 disabled:shadow-none transition-all flex items-center justify-center gap-2"
                  >
                    {isAnalyzing ? <Loader2 className="animate-spin" size={20} /> : <Activity size={20} />}
                    {isAnalyzing ? "Analyzing..." : "Check Interactions"}
                  </button>
                </Card>
              </div>

              <div className="space-y-6">
                <Card title="Analysis Results" icon={CheckCircle2}>
                  {interactions.length > 0 ? (
                    <div className="space-y-4">
                      {interactions.map((inter, i) => (
                        <div key={i} className="p-4 bg-amber-50 border border-amber-100 rounded-xl flex gap-3">
                          <AlertTriangle className="text-amber-600 shrink-0" size={20} />
                          <div>
                            <p className="font-semibold text-amber-900">Potential Interaction Detected</p>
                            <p className="text-sm text-amber-800">
                              <span className="font-bold">{inter.med1}</span> and <span className="font-bold">{inter.med2}</span> may interact.
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : medList.length >= 2 && !isAnalyzing && aiExplanation ? (
                    <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex gap-3">
                      <CheckCircle2 className="text-emerald-600 shrink-0" size={20} />
                      <p className="text-sm text-emerald-800 font-medium">No major database interactions found between these medicines.</p>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-slate-400">
                      <Info size={48} className="mx-auto mb-4 opacity-20" />
                      <p>Add at least two medicines to check for interactions.</p>
                    </div>
                  )}

                  {aiExplanation && (
                    <div className="mt-6 p-6 bg-slate-50 rounded-xl border border-slate-100">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">AI Safety Note</h4>
                      <div className="prose prose-sm text-slate-700 leading-relaxed">
                        {aiExplanation}
                      </div>
                    </div>
                  )}
                </Card>
              </div>
            </motion.div>
          )}

          {activeTab === 'ocr' && (
            <motion.div
              key="ocr"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-4xl mx-auto space-y-8"
            >
              <Card title="Upload Prescription" icon={Camera}>
                <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl p-12 bg-slate-50 hover:bg-slate-100/50 transition-all cursor-pointer relative">
                  <input
                    type="file"
                    accept="image/*"
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setOcrFile(file);
                        setOcrPreview(URL.createObjectURL(file));
                      }
                    }}
                  />
                  {ocrPreview ? (
                    <img src={ocrPreview} alt="Preview" className="max-h-64 rounded-lg shadow-md mb-4" referrerPolicy="no-referrer" />
                  ) : (
                    <Upload size={48} className="text-slate-300 mb-4" />
                  )}
                  <p className="text-slate-600 font-medium">
                    {ocrFile ? ocrFile.name : "Click or drag prescription image here"}
                  </p>
                  <p className="text-xs text-slate-400 mt-2">Supports JPG, PNG (Max 10MB)</p>
                </div>

                <button
                  disabled={!ocrFile || isOcrLoading}
                  onClick={handleOcr}
                  className="w-full mt-8 py-3 bg-emerald-600 text-white rounded-xl font-semibold shadow-lg shadow-emerald-200 hover:bg-emerald-700 disabled:opacity-50 disabled:shadow-none transition-all flex items-center justify-center gap-2"
                >
                  {isOcrLoading ? <Loader2 className="animate-spin" size={20} /> : <Search size={20} />}
                  {isOcrLoading ? "Processing Image..." : "Extract Medicines"}
                </button>
              </Card>

              {ocrResults && (
                <Card title="Extracted Information" icon={FileText}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {ocrResults.medicines.map((med, i) => (
                      <div key={i} className="p-4 bg-white border border-slate-100 rounded-xl shadow-sm flex items-center justify-between">
                        <div>
                          <p className="font-bold text-slate-800">{med.name}</p>
                          <p className="text-xs text-slate-500">Salt: {med.salt}</p>
                        </div>
                        <button 
                          onClick={() => {
                            addMed(med.name);
                            setActiveTab('interactions');
                          }}
                          className="text-emerald-600 hover:bg-emerald-50 p-2 rounded-lg transition-colors"
                        >
                          <Plus size={18} />
                        </button>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </motion.div>
          )}

          {activeTab === 'symptoms' && (
            <motion.div
              key="symptoms"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-4xl mx-auto space-y-8"
            >
              <Card title="Describe Symptoms" icon={Stethoscope}>
                <textarea
                  placeholder="Describe how you're feeling (e.g., 'I have a mild headache and slight fever since morning')..."
                  className="w-full h-32 p-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all resize-none"
                  value={symptomQuery}
                  onChange={(e) => setSymptomQuery(e.target.value)}
                />
                <button
                  disabled={!symptomQuery || isSymptomLoading}
                  onClick={solveSymptom}
                  className="w-full mt-6 py-3 bg-emerald-600 text-white rounded-xl font-semibold shadow-lg shadow-emerald-200 hover:bg-emerald-700 disabled:opacity-50 disabled:shadow-none transition-all flex items-center justify-center gap-2"
                >
                  {isSymptomLoading ? <Loader2 className="animate-spin" size={20} /> : <MessageSquare size={20} />}
                  {isSymptomLoading ? "Consulting AI..." : "Get Guidance"}
                </button>
              </Card>

              {symptomResponse && (
                <Card title="AI Guidance" icon={Info}>
                  <div className="prose prose-slate max-w-none text-slate-700">
                    <div className="whitespace-pre-wrap">{symptomResponse}</div>
                  </div>
                </Card>
              )}
            </motion.div>
          )}

          {activeTab === 'sideeffects' && (
            <motion.div
              key="sideeffects"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-4xl mx-auto space-y-8"
            >
              <Card title="Log Experience" icon={History}>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Age</label>
                    <input
                      type="number"
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      value={sideEffectData.age}
                      onChange={(e) => setSideEffectData({...sideEffectData, age: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Gender</label>
                    <select
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      value={sideEffectData.gender}
                      onChange={(e) => setSideEffectData({...sideEffectData, gender: e.target.value})}
                    >
                      <option value="">Select</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>
                <div className="mb-4">
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Medicines Taken</label>
                  <input
                    type="text"
                    placeholder="e.g. Paracetamol 500mg"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    value={sideEffectData.meds}
                    onChange={(e) => setSideEffectData({...sideEffectData, meds: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Experience / Side Effects</label>
                  <textarea
                    placeholder="Describe what you felt after taking the medicine..."
                    className="w-full h-24 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                    value={sideEffectData.experience}
                    onChange={(e) => setSideEffectData({...sideEffectData, experience: e.target.value})}
                  />
                </div>
                <button
                  disabled={isSideEffectLoading || !sideEffectData.experience}
                  onClick={monitorSideEffect}
                  className="w-full mt-6 py-3 bg-emerald-600 text-white rounded-xl font-semibold shadow-lg shadow-emerald-200 hover:bg-emerald-700 disabled:opacity-50 disabled:shadow-none transition-all flex items-center justify-center gap-2"
                >
                  {isSideEffectLoading ? <Loader2 className="animate-spin" size={20} /> : <History size={20} />}
                  {isSideEffectLoading ? "Analyzing Experience..." : "Log & Analyze"}
                </button>
              </Card>

              {sideEffectResponse && (
                <Card title="Safety Analysis" icon={Shield}>
                  <div className="prose prose-slate max-w-none text-slate-700">
                    <div className="whitespace-pre-wrap">{sideEffectResponse}</div>
                  </div>
                </Card>
              )}
            </motion.div>
          )}

          {activeTab === 'risk' && (
            <motion.div
              key="risk"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-4xl mx-auto space-y-8"
            >
              <Card title="Emergency Risk Assessment" icon={AlertTriangle}>
                <p className="text-sm text-slate-500 mb-6">Select all symptoms that apply to your current situation.</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
                  {[
                    'Chest Pain', 'Shortness of Breath', 'Severe Bleeding', 
                    'Loss of Consciousness', 'Sudden Weakness', 'High Fever',
                    'Persistent Vomiting', 'Severe Abdominal Pain', 'Confusion',
                    'Mild Headache', 'Slight Cough', 'Fatigue'
                  ].map(symptom => (
                    <button
                      key={symptom}
                      onClick={() => {
                        if (riskSymptoms.includes(symptom)) {
                          setRiskSymptoms(riskSymptoms.filter(s => s !== symptom));
                        } else {
                          setRiskSymptoms([...riskSymptoms, symptom]);
                        }
                      }}
                      className={`p-3 text-left rounded-xl border transition-all ${
                        riskSymptoms.includes(symptom)
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-700 font-medium'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {symptom}
                    </button>
                  ))}
                </div>

                <button
                  disabled={riskSymptoms.length === 0}
                  onClick={calculateRisk}
                  className="w-full py-3 bg-slate-900 text-white rounded-xl font-semibold hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
                >
                  <HeartPulse size={20} />
                  Assess Risk Level
                </button>
              </Card>

              {riskScore && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                >
                  <Card className={
                    riskScore.level === 'Emergency' ? 'border-red-200 bg-red-50' :
                    riskScore.level === 'Moderate' ? 'border-amber-200 bg-amber-50' :
                    'border-emerald-200 bg-emerald-50'
                  }>
                    <div className="flex flex-col items-center text-center">
                      <div className={`p-4 rounded-full mb-4 ${
                        riskScore.level === 'Emergency' ? 'bg-red-100 text-red-600' :
                        riskScore.level === 'Moderate' ? 'bg-amber-100 text-amber-600' :
                        'bg-emerald-100 text-emerald-600'
                      }`}>
                        {riskScore.level === 'Emergency' ? <AlertTriangle size={48} /> : 
                         riskScore.level === 'Moderate' ? <Thermometer size={48} /> : 
                         <CheckCircle2 size={48} />}
                      </div>
                      <h3 className={`text-2xl font-bold mb-2 ${
                        riskScore.level === 'Emergency' ? 'text-red-700' :
                        riskScore.level === 'Moderate' ? 'text-amber-700' :
                        'text-emerald-700'
                      }`}>
                        {riskScore.level} Risk Level
                      </h3>
                      <p className="text-slate-700 max-w-md mb-6">{riskScore.advice}</p>
                      <div className="w-full bg-white/50 rounded-xl p-4 border border-white/20">
                        <p className="text-xs font-bold text-slate-400 uppercase mb-2">Risk Score: {riskScore.score}/30</p>
                        <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-500 ${
                              riskScore.level === 'Emergency' ? 'bg-red-500' :
                              riskScore.level === 'Moderate' ? 'bg-amber-500' :
                              'bg-emerald-500'
                            }`}
                            style={{ width: `${(riskScore.score / 30) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
