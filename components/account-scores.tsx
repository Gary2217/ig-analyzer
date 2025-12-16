import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { RadarChartComponent } from "@/components/ui/radar-chart"
import { ProgressBar } from "@/components/ui/progress-bar"

interface ScoreCardProps {
  title: string
  score: number
  level: "Low" | "Medium" | "High"
  description: string
}

const ScoreCard = ({ title, score, level, description }: ScoreCardProps) => {
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
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{title}</CardTitle>
          <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${getLevelColor()}`}>
            {level} {level === 'High' ? 'Risk' : level === 'Medium' ? 'Risk' : 'Risk'}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <span className={`text-3xl font-bold ${getScoreColor()}`}>
            {score}%
          </span>
          <span className="text-sm text-muted-foreground">confidence score</span>
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
  // Map qualitative values to numeric scores
  const mapToScore = (value: string): number => {
    if (value === 'High') return 85
    if (value === 'Medium') return 60
    return 40
  }

  const radarData = [
    { subject: 'Content', value: mapToScore(result.contentConsistency) },
    { subject: 'Engagement', value: mapToScore(result.engagementQuality) },
    { subject: 'Frequency', value: mapToScore(result.postingFrequency) },
    { subject: 'Growth', value: mapToScore(result.abnormalBehaviorRisk === 'Low' ? 'High' : 'Medium') },
    { subject: 'Monetization', value: mapToScore(result.confidenceScore > 70 ? 'High' : 'Medium') },
  ]

  const progressScores = [
    {
      label: 'Growth Potential',
      value: result.abnormalBehaviorRisk === 'Low' ? 85 : 60,
      description: 'Potential for audience growth based on current metrics'
    },
    {
      label: 'Commercial Value',
      value: result.confidenceScore > 70 ? 90 : result.confidenceScore > 50 ? 65 : 40,
      description: 'Attractiveness to potential sponsors and advertisers'
    },
    {
      label: 'Collaboration Readiness',
      value: result.engagementQuality === 'High' ? 88 : result.engagementQuality === 'Medium' ? 65 : 45,
      description: 'Suitability for brand partnerships and collaborations'
    }
  ]

  return (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-3">
        <ScoreCard 
          title="Account Authenticity"
          score={result.confidenceScore}
          level={result.abnormalBehaviorRisk as "Low" | "Medium" | "High"}
          description="Measures how authentic the account appears based on behavior patterns."
        />
        <ScoreCard
          title="Engagement Quality"
          score={mapToScore(result.engagementQuality)}
          level={result.engagementQuality as "Low" | "Medium" | "High"}
          description="Evaluates the quality and authenticity of engagement."
        />
        <ScoreCard
          title="Automation Risk"
          score={100 - mapToScore(result.automationLikelihood)}
          level={result.automationLikelihood as "Low" | "Medium" | "High"}
          description="Indicates likelihood of automated behavior."
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account Strength Overview</CardTitle>
          <p className="text-sm text-muted-foreground">Visual representation of key performance indicators</p>
        </CardHeader>
        <CardContent>
          <div className="h-64 md:h-80">
            <RadarChartComponent data={radarData} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Key Performance Scores</CardTitle>
          <p className="text-sm text-muted-foreground">Detailed breakdown of performance metrics</p>
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
