import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import { RadarChartComponent } from "./ui/radar-chart"
import { ProgressBar } from "./ui/progress-bar"
import { useI18n } from "./locale-provider"

interface ScoreCardProps {
  title: string
  score: number
  level: "Low" | "Medium" | "High"
  description: string
  t: (key: string) => string
  id?: string
  isActive?: boolean
}

const ScoreCard = ({ title, score, level, description, t, id, isActive }: ScoreCardProps) => {
  const getLevelColor = () => {
    switch (level) {
      case 'High':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
      case 'Medium':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
      case 'Low':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
    }
  }

  const getScoreColor = () => {
    if (score >= 70) return 'text-green-600 dark:text-green-400'
    if (score >= 40) return 'text-yellow-600 dark:text-yellow-400'
    return 'text-red-600 dark:text-red-400'
  }

  return (
    <Card
      id={id}
      className={
        isActive
          ? "ring-2 ring-blue-500/60 ring-offset-0 overflow-hidden"
          : "overflow-hidden"
      }
    >
      <CardHeader className="px-4 md:px-6 pb-2">
        <div className="flex items-center justify-between gap-3 min-w-0 overflow-hidden">
          <CardTitle className="text-lg min-w-0 truncate">{title}</CardTitle>
          <span
            className={`text-xs font-medium px-2.5 py-0.5 rounded-full shrink-0 ${getLevelColor()}`}
          >
            {level} {t("results.scores.risk")}
          </span>
        </div>
      </CardHeader>
      <CardContent className="p-4 md:p-6">
        <div className="flex items-baseline gap-2">
          <span className={`text-3xl font-bold ${getScoreColor()}`}>
            {score}%
          </span>
          <span className="text-sm text-muted-foreground">{t("results.scores.confidenceScore")}</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{description}</p>
      </CardContent>
    </Card>
  )
}

interface AccountScoresProps {
  result: {
    confidenceScore: number
    automationLikelihood: string
    abnormalBehaviorRisk: string
    engagementQuality: string
    contentConsistency: string
    postingFrequency: string
  }
  activeKpi?: "authenticity" | "engagement" | "automation" | null
}

export default function AccountScores({ result, activeKpi }: AccountScoresProps) {
  const { t } = useI18n()

  // Map qualitative values to numeric scores
  const mapToScore = (value: string): number => {
    if (value === 'High') return 85
    if (value === 'Medium') return 60
    return 40
  }

  const radarLabel = (subject: string) => {
    if (subject === "Content") return t("results.scores.radar.content")
    if (subject === "Engagement") return t("results.scores.radar.engagement")
    if (subject === "Frequency") return t("results.scores.radar.frequency")
    if (subject === "Growth") return t("results.scores.radar.growth")
    if (subject === "Monetization") return t("results.scores.radar.monetization")
    return subject
  }

  const radarData = [
    { subject: radarLabel('Content'), value: mapToScore(result.contentConsistency) },
    { subject: radarLabel('Engagement'), value: mapToScore(result.engagementQuality) },
    { subject: radarLabel('Frequency'), value: mapToScore(result.postingFrequency) },
    { subject: radarLabel('Growth'), value: mapToScore(result.abnormalBehaviorRisk === 'Low' ? 'High' : 'Medium') },
    { subject: radarLabel('Monetization'), value: mapToScore(result.confidenceScore > 70 ? 'High' : 'Medium') },
  ]

  const radarInsight = (() => {
    if (!radarData.length) return null
    const ranked = [...radarData].sort((a, b) => b.value - a.value)
    const top1 = ranked[0]
    const top2 = ranked[1]
    const low1 = ranked[ranked.length - 1]

    const isEnglish = (top1?.subject ?? '').match(/^[A-Za-z]/)
    if (isEnglish) {
      return `${top1.subject} and ${top2.subject} are your strongest signals — ${low1.subject} is the main bottleneck to fix next.`
    }
    return `${top1.subject}、${top2.subject} 相對突出；${low1.subject} 是目前主要短板，優先補起來會更快放大整體表現。`
  })()

  const radarPanels = (() => {
    if (!radarData.length) return null
    const ranked = [...radarData].sort((a, b) => b.value - a.value)
    const top1 = ranked[0]
    const top2 = ranked[1]
    const low1 = ranked[ranked.length - 1]
    const low2 = ranked[ranked.length - 2]

    const isEnglish = (top1?.subject ?? '').match(/^[A-Za-z]/)

    const left = isEnglish
      ? `${top1?.subject}${top2 ? ` and ${top2.subject}` : ''} look strongest right now.`
      : `${top1?.subject}${top2 ? `、${top2.subject}` : ''} 是你目前最突出的維度。`

    const right = isEnglish
      ? `${low1?.subject}${low2 ? ` and ${low2.subject}` : ''} have the most room to optimize.`
      : `${low1?.subject}${low2 ? `、${low2.subject}` : ''} 相對較弱，優先補強通常最有感。`

    return { left, right }
  })()

  const progressScores = [
    {
      label: t("results.scores.kpis.items.growthPotential.label"),
      value: result.abnormalBehaviorRisk === 'Low' ? 85 : 60,
      description: t("results.scores.kpis.items.growthPotential.desc"),
    },
    {
      label: t("results.scores.kpis.items.commercialValue.label"),
      value: result.confidenceScore > 70 ? 90 : result.confidenceScore > 50 ? 65 : 40,
      description: t("results.scores.kpis.items.commercialValue.desc"),
    },
    {
      label: t("results.scores.kpis.items.collaborationReadiness.label"),
      value: result.engagementQuality === 'High' ? 88 : result.engagementQuality === 'Medium' ? 65 : 45,
      description: t("results.scores.kpis.items.collaborationReadiness.desc"),
    }
  ]

  return (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-3">
        <ScoreCard 
          title={t("results.scores.cards.authenticity.title")}
          score={result.confidenceScore}
          level={result.abnormalBehaviorRisk as "Low" | "Medium" | "High"}
          description={t("results.scores.cards.authenticity.desc")}
          t={t}
          id="account-scores-kpi-authenticity"
          isActive={activeKpi === "authenticity"}
        />
        <ScoreCard
          title={t("results.scores.cards.engagement.title")}
          score={mapToScore(result.engagementQuality)}
          level={result.engagementQuality as "Low" | "Medium" | "High"}
          description={t("results.scores.cards.engagement.desc")}
          t={t}
          id="account-scores-kpi-engagement"
          isActive={activeKpi === "engagement"}
        />
        <ScoreCard
          title={t("results.scores.cards.automation.title")}
          score={100 - mapToScore(result.automationLikelihood)}
          level={result.automationLikelihood as "Low" | "Medium" | "High"}
          description={t("results.scores.cards.automation.desc")}
          t={t}
          id="account-scores-kpi-automation"
          isActive={activeKpi === "automation"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("results.scores.overview.title")}</CardTitle>
          <p className="text-sm text-muted-foreground leading-relaxed">{t("results.scores.overview.subtitle")}</p>
        </CardHeader>
        <CardContent className="p-4 md:p-6">
          <div className="grid gap-4 lg:gap-6 lg:grid-cols-[1fr_minmax(0,560px)_1fr] items-start">
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-4">
              <div className="text-sm font-semibold text-slate-100">目前表現亮點</div>
              <div className="mt-2 text-sm text-slate-200 leading-relaxed">
                {radarPanels?.left ?? ""}
              </div>
            </div>

            <div className="w-full">
              <div className="mx-auto w-full max-w-[560px]">
                <div className="h-[420px] md:h-[520px] lg:h-[600px]">
                  <RadarChartComponent data={radarData} />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-4">
              <div className="text-sm font-semibold text-slate-100">潛在風險與機會</div>
              <div className="mt-2 text-sm text-slate-200 leading-relaxed">
                {radarPanels?.right ?? ""}
              </div>
            </div>
          </div>
          {radarInsight && (
            <div className="mt-4 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 leading-relaxed">
              {radarInsight}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("results.scores.kpis.title")}</CardTitle>
          <p className="text-sm text-muted-foreground leading-relaxed">{t("results.scores.kpis.subtitle")}</p>
        </CardHeader>
        <CardContent className="p-4 md:p-6 space-y-4">
          {progressScores.map((item, index) => (
            <div key={index}>
              <ProgressBar 
                value={item.value} 
                label={item.label}
                className="mb-1"
              />
              <p className="text-xs text-muted-foreground leading-relaxed">{item.description}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
