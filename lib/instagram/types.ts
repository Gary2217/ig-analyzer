export type GraphPagingCursors = {
  before?: string
  after?: string
}

export type GraphPaging = {
  cursors?: GraphPagingCursors
  next?: string
  previous?: string
}

export type GraphListResponse<T> = {
  data: T[]
  paging?: GraphPaging
}

export type IgMediaListItem = {
  id: string
  caption?: string
  media_type?: string
  media_url?: string
  permalink?: string
  timestamp?: string
}

export type IgMediaDetails = {
  id: string
  media_type?: string
  media_product_type?: string
  permalink?: string
  timestamp?: string
  thumbnail_url?: string
  caption?: string
}

export type IgInsightValue = {
  value?: number
  end_time?: string
}

export type IgInsightItem = {
  name?: string
  period?: string
  values?: IgInsightValue[]
  title?: string
  description?: string
  id?: string
}

export type IgInsightsResponse = {
  data?: IgInsightItem[]
}

export type GraphErrorBody = {
  error?: {
    message?: string
    type?: string
    code?: number
    error_subcode?: number
    fbtrace_id?: string
  }
  message?: string
  code?: number
  fbtrace_id?: string
}
