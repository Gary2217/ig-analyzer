"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { ArrowLeft } from "lucide-react"
import { Toaster } from "sonner"
import GrowthPaths from "@/components/growth-paths"
import AccountScores from "@/components/account-scores"
import { MonetizationSection } from "@/components/monetization-section"
import { ShareResults } from "@/components/share-results"

type FakeAnalysis = {
  platform: "instagram" | "threads"
  username: string
  accountType: string
  accountAge: string
  visibility: string
  postingFrequency: string
  recentActivityTrend: string
  contentConsistency: string
  engagementQuality: string
  interactionPattern: string
  automationLikelihood: string
  abnormalBehaviorRisk: string
  notes: string[]
  confidenceScore: number
  analysisType: string
  disclaimer: string
}

export default function ResultsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [result, setResult] = useState<FakeAnalysis | null>(null)
  const [loading, setLoading] = useState(true)
  const [isSubscribed, setIsSubscribed] = useState(false)

  useEffect(() => {
    // In a real app, you would fetch the analysis results here
    // For demo purposes, we'll simulate a loading state and then set the result
    const timer = setTimeout(() => {
      setResult({
        platform: searchParams.get('platform') as "instagram" | "threads" || "instagram",
        username: searchParams.get('username') || '',
        accountType: searchParams.get('accountType') || 'Personal Account',
        accountAge: 'Established account',
        visibility: 'Public',
        postingFrequency: 'High',
        recentActivityTrend: 'Stable',
        contentConsistency: 'Consistent',
        engagementQuality: 'High',
        interactionPattern: 'Mostly organic',
        automationLikelihood: 'Low',
        abnormalBehaviorRisk: 'Low',
        notes: [
          'Content cadence aligns with human posting windows.',
          'Engagement appears organic and consistent.',
          'No signs of automation detected.'
        ],
        confidenceScore: 92,
        analysisType: 'Demo analysis',
        disclaimer: 'This is a simulated analysis for demonstration purposes.'
      })
      setLoading(false)
    }, 1000)

    return () => clearTimeout(timer)
  }, [searchParams])

  if (loading) {
    return (
      <main className="min-h-screen w-full flex items-center justify-center bg-[#0b1220] px-4 overflow-x-hidden">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
          <p>Analyzing account...</p>
        </div>
      </main>
    )
  }

  if (!result) {
    return (
      <main className="min-h-screen w-full flex items-center justify-center bg-[#0b1220] px-4 overflow-x-hidden">
        <Alert>
          <AlertTitle>No analysis results found</AlertTitle>
          <AlertDescription>
            We couldn't find any analysis results. Please try analyzing an account again.
          </AlertDescription>
          <Button
            className="mt-4"
            onClick={() => router.push("/")}
          >
            Back to Home
          </Button>
        </Alert>
      </main>
    )
  }

  const hasSidebar = Boolean(result.username)

  return (
    <>
      <Toaster position="top-center" />
      <main className="min-h-screen w-full bg-[#0b1220] py-6 px-4 sm:px-6 overflow-x-hidden">
        <div className="w-full max-w-none mx-auto">
          <Button
            variant="ghost"
            onClick={() => router.back()}
            className="mb-6"
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>

          {/* Responsive grid: 手機 1 欄；有 sidebar 時 md+ 並排，無 sidebar 則單欄撐滿 */}
          <div className="grid grid-cols-1 gap-6 lg:gap-4">
            <div className="w-full lg:col-span-2 space-y-6 lg:space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-2xl lg:text-xl">
                    @{result.username}
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      {result.platform === 'instagram' ? 'Instagram' : 'Threads'}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <AccountScores 
                    result={{
                      confidenceScore: result.confidenceScore,
                      automationLikelihood: result.automationLikelihood as "Low" | "Medium" | "High",
                      abnormalBehaviorRisk: result.abnormalBehaviorRisk as "Low" | "Medium" | "High",
                      engagementQuality: result.engagementQuality as "Low" | "Medium" | "High",
                      contentConsistency: result.contentConsistency as "Low" | "Medium" | "High",
                      postingFrequency: result.postingFrequency as "Low" | "Medium" | "High"
                    }} 
                  />
                  
                  {/* Add Monetization Section */}
                  <div className="mt-8 lg:mt-6">
                    <MonetizationSection 
                      monetizationGap={18} // This would be calculated from the analysis in a real app
                      isSubscribed={isSubscribed}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-xl lg:text-lg">Account Insights</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4 lg:space-y-3">
                    <div className="grid grid-cols-2 gap-6 lg:gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Account Type</p>
                        <p className="font-medium">{result.accountType}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Account Age</p>
                        <p className="font-medium">{result.accountAge}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Visibility</p>
                        <p className="font-medium">{result.visibility}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Posting Frequency</p>
                        <p className="font-medium">{result.postingFrequency}</p>
                      </div>
                    </div>

                    {result.notes.length > 0 && (
                      <div>
                        <h3 className="text-sm font-medium mb-2">Key Findings</h3>
                        <ul className="space-y-2 lg:space-y-1.5">
                          {result.notes.map((note, i) => (
                            <li key={i} className="flex items-start">
                              <span className="text-green-500 mr-2">•</span>
                              <span>{note}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Share Results Section - Moved to bottom of main content */}
            </div>

            {hasSidebar && (
              <div className="lg:col-span-1 w-full">
                <Card className="sticky top-4 max-h-[calc(100vh-6rem)] ... p-4 ...">
                  <CardHeader className="border-b border-slate-700/50">
                    <CardTitle className="text-base">Growth Opportunities</CardTitle>
                    <p className="text-sm text-slate-400 mt-1 lg:mt-0.5">
                      Personalized recommendations for @{result.username}
                    </p>
                  </CardHeader>
                  <div className="flex-1 overflow-y-auto">
                    <CardContent className="pb-6 lg:pb-4">
                      <GrowthPaths
                        result={{
                          handle: result.username,
                          platform: result.platform,
                          confidence: result.confidenceScore,
                          abnormalBehaviorRisk: result.abnormalBehaviorRisk as "Low" | "Medium" | "High",
                          automationLikelihood: result.automationLikelihood as "Low" | "Medium" | "High",
                        }}
                      />
                    </CardContent>
                  </div>
                </Card>
              </div>
            )}
          </div>

          <div className="mt-12 lg:mt-8 space-y-8 lg:space-y-6">
            <ShareResults 
              platform={result.platform === 'instagram' ? 'Instagram' : 'Threads'}
              username={result.username}
              monetizationGap={18}
            />
            <div className="text-center text-sm text-slate-400 pt-4 lg:pt-3 border-t border-slate-800">
              <p>{result.disclaimer}</p>
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
