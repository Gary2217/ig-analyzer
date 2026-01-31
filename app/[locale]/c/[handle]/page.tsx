import { notFound, redirect } from "next/navigation"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface CreatorHandlePageProps {
  params: Promise<{
    locale: string
    handle: string
  }>
}

export default async function CreatorHandlePage({ params }: CreatorHandlePageProps) {
  const resolvedParams = await params
  void resolvedParams
  notFound()
}
