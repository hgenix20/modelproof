import { useState } from 'react';
import { Layout } from './Layout';
import { ChatWindow } from './components/ChatWindow';
import { AuditPanel } from './components/AuditPanel';
import { AuditResult } from './agents/RiskAuditorAgent';

type AnalysisStatus = 'queued' | 'generating' | 'complete';

interface AnalysisProgress {
  hallucination: AnalysisStatus;
  bias: AnalysisStatus;
  toxicity: AnalysisStatus;
  intent_alignment: AnalysisStatus;
}

function App() {
  const [auditResult, setAuditResult] = useState<AuditResult | undefined>(undefined);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress>({
    hallucination: 'queued',
    bias: 'queued',
    toxicity: 'queued',
    intent_alignment: 'queued'
  });

  const handleAuditUpdate = (result: AuditResult) => {
    setAuditResult(result);
    setIsAnalyzing(false);
  };

  const handleAnalysisStart = () => {
    setIsAnalyzing(true);
    setAnalysisProgress({
      hallucination: 'queued',
      bias: 'queued',
      toxicity: 'queued',
      intent_alignment: 'queued'
    });
  };

  const handleAuditProgress = (type: 'hallucination' | 'bias' | 'toxicity' | 'intent_alignment') => {
    setAnalysisProgress(prev => ({
      ...prev,
      [type]: 'generating'
    }));
  };

  return (
    <Layout
      chat={<ChatWindow 
        onAuditUpdate={handleAuditUpdate}
        onAnalysisStart={handleAnalysisStart}
        onAuditProgress={handleAuditProgress}
      />}
      audit={<AuditPanel 
        result={auditResult}
        isAnalyzing={isAnalyzing}
        analysisProgress={analysisProgress}
      />}
    />
  );
}

export default App;
