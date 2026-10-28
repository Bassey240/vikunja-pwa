/* Vikunja 2.4 ships its Pro features in the same AGPLv3 build and unlocks them
 * with a runtime license key; /info then lists them in enabled_pro_features.
 * The client only REFLECTS that list — it never validates keys and never
 * grants anything itself. Kept pure and alias-free so node can unit-test it. */

/* Vikunja 2.4: "Site admins bypass all Can* checks (license-gated)". */
export const PRO_FEATURE_SITE_ADMIN_BYPASS = 'siteadminbypass'

/* Vikunja 2.4 licence key for time tracking, as it appears in /info. */
export const PRO_FEATURE_TIME_TRACKING = 'time_tracking'

interface ProFeatureSource {
	enabled_pro_features?: string[]
}

export function getEnabledProFeatures(info: ProFeatureSource | null | undefined) {
	const raw = info?.enabled_pro_features
	if (!Array.isArray(raw)) {
		return []
	}

	return raw
		.map(entry => `${entry ?? ''}`.trim().toLowerCase())
		.filter(entry => entry.length > 0 && entry !== 'null' && entry !== 'undefined' && !/^\d+$/.test(entry))
}

export function hasProFeature(info: ProFeatureSource | null | undefined, feature: string) {
	return hasEnabledProFeature(info?.enabled_pro_features, feature)
}

/* The gateway hands the app an already-normalized list, so this is the entry
 * point for anything reading Account.instanceFeatures rather than raw /info. */
export function hasEnabledProFeature(features: string[] | null | undefined, feature: string) {
	const needle = `${feature || ''}`.trim().toLowerCase()
	if (!needle) {
		return false
	}
	return getEnabledProFeatures({enabled_pro_features: features ?? undefined}).includes(needle)
}
