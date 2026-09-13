import React from 'react'

/**
 * Without this, any thrown render error unmounts the whole tree and the window
 * goes blank — with the message only visible in a devtools console the user has
 * no reason to open. Show it on screen instead, with the stack, so a crash is
 * reportable rather than mysterious.
 */
interface State {
  error: Error | null
  info: string
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null, info: '' }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Also goes to the renderer console, which main mirrors into the crash log.
    console.error('Renderer crash:', error, info.componentStack)
    this.setState({ info: info.componentStack ?? '' })
  }

  render(): React.ReactNode {
    const { error, info } = this.state
    if (!error) return this.props.children
    return (
      <div className="flex h-screen flex-col gap-4 overflow-auto bg-background p-8 [&>*]:shrink-0">
        <div>
          <h1 className="m-0 text-[18px] font-semibold">Something in the interface crashed.</h1>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            Your data is untouched — this is a display error. The details below are what to report.
          </p>
        </div>
        <pre className="overflow-auto rounded-[10px] border border-danger/30 bg-danger-soft p-3 text-[12px] leading-relaxed text-danger">
          {error.message}
          {error.stack ? `\n\n${error.stack}` : ''}
        </pre>
        {info && (
          <pre className="max-h-64 overflow-auto rounded-[10px] border border-border bg-card-muted p-3 text-[11.5px] leading-relaxed text-muted-foreground">
            {info}
          </pre>
        )}
        <div>
          <button
            className="rounded-[8px] bg-primary px-3.5 py-2 text-[12.5px] font-semibold text-primary-foreground"
            onClick={() => this.setState({ error: null, info: '' })}
          >
            Try again
          </button>
        </div>
      </div>
    )
  }
}
