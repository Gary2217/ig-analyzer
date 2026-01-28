import { redirect } from "next/navigation"

interface CreatorProfilePageProps {
  params: Promise<{
    locale: string
    id: string
  }>
}

export default async function CreatorProfilePage({ params }: CreatorProfilePageProps) {
  const resolvedParams = await params
  const locale = resolvedParams.locale
  const id = resolvedParams.id

  // Redirect to new card display route
  redirect(`/${locale}/card/${id}`)
}
