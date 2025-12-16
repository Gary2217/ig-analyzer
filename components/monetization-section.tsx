import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Lock, Zap, CheckCircle, BarChart, TrendingUp, ClipboardList, MessageSquare, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface MonetizationSectionProps {
  monetizationGap: number
  isSubscribed?: boolean
}

export function MonetizationSection({ monetizationGap, isSubscribed = false }: MonetizationSectionProps) {
  const features = [
    {
      title: "Weekly Growth Plan",
      icon: TrendingUp,
      description: "Personalized weekly action items to grow your audience"
    },
    {
      title: "Content Direction Strategy",
      icon: BarChart,
      description: "Data-driven content recommendations based on your niche"
    },
    {
      title: "Monetization Readiness",
      icon: CheckCircle,
      description: "Step-by-step guide to prepare your account for monetization"
    },
    {
      title: "Brand Collaboration Insights",
      icon: MessageSquare,
      description: "Access to brand partnership opportunities and negotiation tips"
    }
  ]

  return (
    <div className="space-y-6">
      {/* Monetization Gap Indicator */}
      <Card className="border-blue-500/20 bg-gradient-to-r from-blue-500/5 to-blue-500/[0.02] hover:shadow-lg transition-shadow">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-500/10 text-blue-500">
              <Zap className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg text-foreground">
                Only {monetizationGap}% away from consistent monetization
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Unlock the exact steps to close the gap and start earning.
              </p>
            </div>
            <Button className="whitespace-nowrap mt-2 sm:mt-0">
              See how <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {!isSubscribed ? (
        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-background/80 to-background/80 backdrop-blur-sm z-10 flex items-center justify-center">
            <div className="text-center p-8 max-w-md">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30 mb-4">
                <Lock className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Unlock Your Monetization Potential</h3>
              <p className="text-sm text-muted-foreground mb-6">
                Get personalized strategies to maximize your earnings and grow your audience
              </p>
              <div className="space-y-3">
                <Button className="w-full" size="lg">
                  Unlock Full Analysis - NT$99/month
                </Button>
                <p className="text-xs text-muted-foreground">
                  Cancel anytime · No credit card required (demo)
                </p>
              </div>
            </div>
          </div>
          <CardHeader>
            <CardTitle className="text-xl">Monetization Action Plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {features.map((feature, index) => (
              <div key={index} className="group relative">
                <div className="flex items-start">
                  <div className="flex-shrink-0 h-10 w-10 rounded-full bg-muted flex items-center justify-center mr-4">
                    <feature.icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center">
                      <h4 className="font-medium">{feature.title}</h4>
                      <Lock className="h-3.5 w-3.5 ml-2 text-muted-foreground opacity-70" />
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {feature.description}
                    </p>
                    <div className="mt-2 space-y-1.5">
                      <div className="h-3 bg-muted rounded-full w-5/6"></div>
                      <div className="h-3 bg-muted rounded-full w-2/3"></div>
                    </div>
                  </div>
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-2">
                  <div className="text-xs text-muted-foreground flex items-center">
                    <Lock className="h-3 w-3 mr-1" /> Subscribe to view details
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Monetization Action Plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {features.map((feature, index) => (
              <div key={index} className="flex items-start group">
                <div className="flex-shrink-0 h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mr-4 group-hover:bg-primary/20 transition-colors">
                  <feature.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-medium group-hover:text-primary transition-colors">
                    {feature.title}
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
