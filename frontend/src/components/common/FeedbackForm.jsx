import { useState } from 'react';
import { api } from '../../api/client';

const EMPTY_FEEDBACK = {
  type: 'system',
  subject: '',
  message: '',
};

export default function FeedbackForm({ compact = false }) {
  const [feedbackForm, setFeedbackForm] = useState(EMPTY_FEEDBACK);
  const [feedbackStatus, setFeedbackStatus] = useState(null);
  const [feedbackSending, setFeedbackSending] = useState(false);

  const updateFeedback = (field, value) => {
    setFeedbackForm(prev => ({ ...prev, [field]: value }));
    setFeedbackStatus(null);
  };

  const submitFeedback = async (event) => {
    event.preventDefault();
    if (!feedbackForm.subject.trim() || !feedbackForm.message.trim()) {
      setFeedbackStatus({ type: 'danger', text: 'Ingrese asunto y comentario.' });
      return;
    }

    setFeedbackSending(true);
    setFeedbackStatus(null);
    try {
      await api.feedback.submit(feedbackForm);
      setFeedbackStatus({ type: 'success', text: 'Feedback enviado correctamente.' });
      setFeedbackForm(EMPTY_FEEDBACK);
    } catch (err) {
      setFeedbackStatus({
        type: 'danger',
        text: err.response?.data?.error || 'No se pudo enviar el feedback.',
      });
    } finally {
      setFeedbackSending(false);
    }
  };

  return (
    <form className={`feedback-form${compact ? ' feedback-form-compact' : ''}`} onSubmit={submitFeedback}>
      <div className="feedback-form-row">
        <div className="form-group">
          <label className="form-label">Tipo</label>
          <select
            className="form-input"
            value={feedbackForm.type}
            onChange={e => updateFeedback('type', e.target.value)}
            disabled={feedbackSending}
          >
            <option value="system">Sistema</option>
            <option value="transparency">Transparencia</option>
          </select>
        </div>

        <div className="form-group feedback-subject-field">
          <label className="form-label">Asunto</label>
          <input
            className="form-input"
            value={feedbackForm.subject}
            onChange={e => updateFeedback('subject', e.target.value)}
            maxLength={120}
            disabled={feedbackSending}
          />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Comentario</label>
        <textarea
          className="form-input feedback-textarea"
          value={feedbackForm.message}
          onChange={e => updateFeedback('message', e.target.value)}
          maxLength={2000}
          disabled={feedbackSending}
        />
      </div>

      <div className="feedback-form-actions">
        {feedbackStatus && (
          <div className={`alert alert-${feedbackStatus.type}`}>
            {feedbackStatus.text}
          </div>
        )}
        <button className="btn btn-primary" type="submit" disabled={feedbackSending}>
          {feedbackSending ? 'Enviando...' : 'Enviar comentario'}
        </button>
      </div>
    </form>
  );
}
