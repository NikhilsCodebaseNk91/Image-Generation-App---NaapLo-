import React from 'react';
import { AlertTriangle, AlertCircle, X, CheckCircle2 } from 'lucide-react';

interface StatusAlertProps {
  type: 'error' | 'warning' | 'success';
  title?: string;
  message: string;
  onDismiss?: () => void;
}

export const StatusAlert: React.FC<StatusAlertProps> = ({
  type,
  title,
  message,
  onDismiss,
}) => {
  const styles = {
    error: {
      container: 'bg-red-50 border-red-200 text-red-900',
      icon: <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />,
      defaultTitle: 'Generation Error',
    },
    warning: {
      container: 'bg-amber-50 border-amber-200 text-amber-900',
      icon: <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />,
      defaultTitle: 'Notice',
    },
    success: {
      container: 'bg-emerald-50 border-emerald-200 text-emerald-900',
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />,
      defaultTitle: 'Success',
    },
  }[type];

  return (
    <div
      role="alert"
      className={`border rounded-lg p-4 flex items-start justify-between gap-3 text-sm shadow-xs ${styles.container}`}
    >
      <div className="flex items-start gap-3">
        {styles.icon}
        <div>
          <h4 className="font-semibold">{title || styles.defaultTitle}</h4>
          <p className="mt-0.5 text-xs sm:text-sm opacity-90 leading-relaxed whitespace-pre-line">
            {message}
          </p>
        </div>
      </div>

      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="text-stone-500 hover:text-stone-800 p-1 rounded-sm"
          title="Dismiss alert"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
