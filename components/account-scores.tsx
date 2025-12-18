import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import { RadarChartComponent } from "./ui/radar-chart"
import { ProgressBar } from "./ui/progress-bar"
import { useI18n } from "./locale-provider"

interface ScoreCardProps {
  title: string
  score: number
  level: "Low" | "Medium" | "High"
  description: string
}

const ScoreCard = ({ title, score, level, description }: ScoreCardProps) => {
  const { t } = useI18n()

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

  const levelLabel = () => {
    if (level === "High") return t("results.scores.level.high")
    if (level === "Medium") return t("results.scores.level.medium")
    return t("results.scores.level.low")
  }

  const getScoreColor = () => {
    if (score >= 70) return 'text-green-600 dark:text-green-400'
    if (score >= 40) return 'text-yellow-600 dark:text-yellow-400'
    return 'text-red-600 dark:text-red-400'
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{title}</CardTitle>
          <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${getLevelColor()}`}>
            {levelLabel()} {t("results.scores.risk")}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <span className={`text-3xl font-bold ${getScoreColor()}`}>
            {score}%
          </span>
          <span className="text-sm text-muted-foreground">{t("results.scores.confidenceScore")}</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
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
}

export default function AccountScores({ result }: AccountScoresProps) {
  const { t } = useI18n()

  // Map qualitative values to numeric scores
  const mapToScore = (value: string): number => {
    if (value === 'High') return 85
    if (value === 'Medium') return 60
    return 40
  }

  const radarData = [
    { subject: t("results.scores.radar.content"), value: mapToScore(result.contentConsistency) },
    { subject: t("results.scores.radar.engagement"), value: mapToScore(result.engagementQuality) },
    { subject: t("results.scores.radar.frequency"), value: mapToScore(result.postingFrequency) },
    { subject: t("results.scores.radar.growth"), value: mapToScore(result.abnormalBehaviorRisk === 'Low' ? 'High' : 'Medium') },
    { subject: t("results.scores.radar.monetization"), value: mapToScore(result.confidenceScore > 70 ? 'High' : 'Medium') },
  ]

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
        />
        <ScoreCard
          title={t("results.scores.cards.engagement.title")}
          score={mapToScore(result.engagementQuality)}
          level={result.engagementQuality as "Low" | "Medium" | "High"}
          description={t("results.scores.cards.engagement.desc")}
        />
        <ScoreCard
          title={t("results.scores.cards.automation.title")}
          score={100 - mapToScore(result.automationLikelihood)}
          level={result.automationLikelihood as "Low" | "Medium" | "High"}
          description={t("results.scores.cards.automation.desc")}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("results.scores.overview.title")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("results.scores.overview.subtitle")}</p>
        </CardHeader>
        <CardContent>
          <div className="h-64 md:h-80">
            <RadarChartComponent data={radarData} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("results.scores.kpis.title")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("results.scores.kpis.subtitle")}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {progressScores.map((item, index) => (
            <div key={index}>
              <ProgressBar 
                value={item.value} 
                label={item.label}
                className="mb-1"
              />
              <p className="text-xs text-muted-foreground">{item.description}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
