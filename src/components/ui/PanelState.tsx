type PanelStateProps = {
  kind: 'loading' | 'empty' | 'error'
  message: string
}

export function PanelState({ kind, message }: PanelStateProps) {
  if (kind === 'loading') {
    return <div className="panel-state" role="status"><span className="spinner" aria-hidden="true" />Loading {message}</div>
  }

  return <div className="panel-state" role={kind === 'error' ? 'alert' : 'status'}>{message}</div>
}
