/**
 * A job posting pulled from a URL, ready to prefill the Tailor form.
 * `source` says where the structured data came from: a job-board API
 * (Ashby, Greenhouse, Lever) or a generic web page parsed by the model.
 */
export interface JobPosting {
  company: string
  role: string
  location: string
  description: string
  source: 'ashby' | 'greenhouse' | 'lever' | 'linkedin' | 'page'
}
