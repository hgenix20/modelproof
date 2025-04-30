/**
 * Represents a single audit item in the security analysis.
 * @interface AuditItem
 * @property {string} id - Unique identifier for the audit item
 * @property {'warning' | 'error' | 'info'} type - Severity level of the audit item
 * @property {string} message - Description of the audit finding
 * @property {Date} timestamp - When the audit item was detected
 */
interface AuditItem {
  id: string;
  type: 'warning' | 'error' | 'info';
  message: string;
  timestamp: Date;
}

/**
 * Represents the complete audit results for a model response.
 * @interface AuditResult
 * @property {string} summary - High-level summary of the audit findings
 * @property {AuditItem[]} items - Detailed list of audit findings
 * @property {Object} scores - Numerical scores for different risk categories
 * @property {number} scores.hallucination - Score for hallucination risk (0-1)
 * @property {number} scores.bias - Score for bias risk (0-1)
 * @property {number} scores.toxicity - Score for toxicity risk (0-1)
 * @property {number} scores.intent_alignment - Score for intent alignment (0-1)
 * @property {string} explanation - Detailed explanation of the audit results
 */
interface AuditResult {
  summary: string;
  items: AuditItem[];
  scores: {
    hallucination: number;
    bias: number;
    toxicity: number;
    intent_alignment: number;
  };
  explanation: string;
}

/**
 * Props for the AuditPanel component.
 * @interface AuditPanelProps
 * @property {AuditResult} [result] - The audit results to display
 * @property {boolean} [isAnalyzing] - Whether an audit is currently in progress
 * @property {string} [error] - Error message if the audit failed
 * @property {Object} [analysisProgress] - Progress status for each analysis type
 */
interface AuditPanelProps {
  result?: AuditResult;
  isAnalyzing?: boolean;
  error?: string;
  analysisProgress?: {
    hallucination: 'queued' | 'generating' | 'complete' | 'error';
    bias: 'queued' | 'generating' | 'complete' | 'error';
    toxicity: 'queued' | 'generating' | 'complete' | 'error';
    intent_alignment: 'queued' | 'generating' | 'complete' | 'error';
  };
}

/**
 * A React component that displays security audit results for AI model responses.
 * Shows risk scores for hallucination, bias, toxicity, and intent alignment,
 * along with detailed findings and progress indicators.
 * 
 * @component
 * @param {AuditPanelProps} props - Component props
 * @returns {JSX.Element} The rendered audit panel
 * 
 * @example
 * <AuditPanel
 *   result={auditResult}
 *   isAnalyzing={false}
 *   analysisProgress={{
 *     hallucination: 'complete',
 *     bias: 'complete',
 *     toxicity: 'complete',
 *     intent_alignment: 'complete'
 *   }}
 * />
 */
export function AuditPanel({ result, isAnalyzing, error, analysisProgress }: AuditPanelProps) {
  const getRiskIcon = (score: number, isIntentAlignment = false) => {
    if (isIntentAlignment) {
      if (score > 0.7) return '✅';
      if (score > 0.3) return '⚠️';
      return '❌';
    }
    if (score < 0.3) return '✅';
    if (score < 0.7) return '⚠️';
    return '❌';
  };

  const getScoreColor = (score: number, isIntentAlignment = false) => {
    if (isIntentAlignment) {
      if (score > 0.7) return 'text-green-600';
      if (score > 0.3) return 'text-yellow-600';
      return 'text-red-600';
    }
    if (score < 0.3) return 'text-green-600';
    if (score < 0.7) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreLabel = (score: number, isIntentAlignment = false) => {
    if (isIntentAlignment) {
      if (score > 0.7) return 'Good';
      if (score > 0.3) return 'Moderate';
      return 'Poor';
    }
    if (score < 0.3) return 'Good';
    if (score < 0.7) return 'Moderate';
    return 'Poor';
  };

  const getProgressIcon = (status: 'queued' | 'generating' | 'complete' | 'error') => {
    switch (status) {
      case 'queued':
        return '⏳';
      case 'generating':
        return '🔄';
      case 'complete':
        return '✅';
      case 'error':
        return '❌';
    }
  };

  const getProgressColor = (status: 'queued' | 'generating' | 'complete' | 'error') => {
    switch (status) {
      case 'queued':
        return 'text-gray-400';
      case 'generating':
        return 'text-blue-500 animate-pulse';
      case 'complete':
        return 'text-green-500';
      case 'error':
        return 'text-red-500';
    }
  };

  if (error) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 border-b">
          <h2 className="text-xl font-semibold text-gray-800">Response Audit</h2>
          <p className="text-sm text-red-500">Audit failed: {error}</p>
        </div>
        <div className="flex-1 p-4 space-y-4">
          {[
            { label: 'Hallucination', key: 'hallucination' },
            { label: 'Bias', key: 'bias' },
            { label: 'Toxicity', key: 'toxicity' },
            { label: 'Intent Alignment', key: 'intent_alignment' }
          ].map(({ label, key }) => (
            <div key={key} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl text-red-500">❌</span>
                <span className="text-sm text-gray-600">{label}</span>
              </div>
              <div className="text-xs text-red-500">Failed</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isAnalyzing) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 border-b">
          <h2 className="text-xl font-semibold text-gray-800">Security Audit</h2>
          <p className="text-sm text-gray-500">Auditing. Please wait...</p>
        </div>
        <div className="flex-1 p-4 space-y-4">
          {[
            { label: 'Hallucination', key: 'hallucination' },
            { label: 'Bias', key: 'bias' },
            { label: 'Toxicity', key: 'toxicity' },
            { label: 'Intent Alignment', key: 'intent_alignment' }
          ].map(({ label, key }) => (
            <div key={key} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`text-2xl ${getProgressColor(analysisProgress?.[key as keyof typeof analysisProgress] || 'queued')}`}>
                  {getProgressIcon(analysisProgress?.[key as keyof typeof analysisProgress] || 'queued')}
                </span>
                <span className="text-sm text-gray-600">{label}</span>
              </div>
              <div className="text-xs text-gray-500">
                {analysisProgress?.[key as keyof typeof analysisProgress] === 'queued' && 'Queued'}
                {analysisProgress?.[key as keyof typeof analysisProgress] === 'generating' && 'Generating...'}
                {analysisProgress?.[key as keyof typeof analysisProgress] === 'complete' && 'Complete'}
                {analysisProgress?.[key as keyof typeof analysisProgress] === 'error' && 'Failed'}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 border-b">
          <h2 className="text-xl font-semibold text-gray-800">Security Audit</h2>
          <p className="text-sm text-gray-500">Waiting for AI response...</p>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-500">
            No analysis results available yet.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b">
        <h2 className="text-xl font-semibold text-gray-800">Security Audit</h2>
        
        {/* Intent Alignment Section */}
        <div className="mt-4 p-4 bg-blue-50 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-2xl">
                {getRiskIcon(result.scores.intent_alignment, true)}
              </span>
              <span className="text-sm font-medium text-gray-700">Intent Alignment</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-semibold ${getScoreColor(result.scores.intent_alignment, true)}`}>
                {Math.round(result.scores.intent_alignment * 100)}%
              </span>
              <span className="text-xs text-gray-500">
                {getScoreLabel(result.scores.intent_alignment, true)}
              </span>
            </div>
          </div>
          <div className="text-sm text-gray-600">
            {result.explanation}
          </div>
        </div>

        {/* Other Metrics Section */}
        <div className="mt-4 space-y-3">
          <h3 className="text-sm font-medium text-gray-700">Content Safety Metrics</h3>
          {[
            { label: 'Hallucination', value: result.scores.hallucination },
            { label: 'Bias', value: result.scores.bias },
            { label: 'Toxicity', value: result.scores.toxicity }
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{getRiskIcon(value)}</span>
                <span className="text-sm text-gray-600">{label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-semibold ${getScoreColor(value)}`}>
                  {Math.round(value * 100)}%
                </span>
                <span className="text-xs text-gray-500">
                  {getScoreLabel(value)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {result.items.length === 0 ? (
          <div className="text-center text-green-700 font-medium mt-4">
            ✅ No issues found. This response appears safe.
          </div>
        ) : (
          result.items.map((item) => (
            <div
              key={item.id}
              className={`border-l-4 p-4 rounded-md shadow-sm ${
                item.type === 'error'
                  ? 'border-red-500 bg-red-50 text-red-800'
                  : item.type === 'warning'
                  ? 'border-yellow-500 bg-yellow-50 text-yellow-800'
                  : 'border-blue-500 bg-blue-50 text-blue-800'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="text-xl">
                  {item.type === 'error' ? '❌' : item.type === 'warning' ? '⚠️' : 'ℹ️'}
                </div>
                <div>
                  <p className="font-semibold">Potential Issue</p>
                  <p className="italic text-sm">{item.message}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Detected at {item.timestamp.toLocaleTimeString()}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
} 