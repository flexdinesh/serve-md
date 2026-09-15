import { createContext, type ReactNode, useContext, useEffect, useState } from "react"

import { defaultFeatures, parseFeatureValue, type Features } from "../features.ts"

interface FeatureProviderProps {
  children: ReactNode
  initialFeatures?: Features | null
}

const FeatureContext = createContext<Features | undefined>(undefined)

export function FeatureProvider({ children, initialFeatures = null }: FeatureProviderProps) {
  const [features, setFeatures] = useState<Features | null>(() => initialFeatures && { ...initialFeatures })

  useEffect(() => {
    if (features) return
    const controller = new AbortController()

    void fetch("/api/features", {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error("Feature request failed")
      const value: unknown = await response.json()
      setFeatures(parseFeatureValue(value) ?? { ...defaultFeatures })
    }).catch(() => {
      if (!controller.signal.aborted) setFeatures({ ...defaultFeatures })
    })

    return () => controller.abort()
  }, [features])

  if (!features) return null
  return <FeatureContext value={features}>{children}</FeatureContext>
}

export function useFeatures(): Features {
  const features = useContext(FeatureContext)
  if (!features) throw new Error("useFeatures must be used within FeatureProvider")
  return features
}
