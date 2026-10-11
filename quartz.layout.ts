import { PageLayout, SharedLayout } from "./quartz/cfg"
import * as Component from "./quartz/components"

// components shared across all pages
export const sharedPageComponents: SharedLayout = {
  head: Component.Head(),
  header: [],
  afterBody: [],
  footer: Component.Footer({
    links: {
      Хроника: "/evial-chronicle/sessions/",
      Персонажи: "/evial-chronicle/characters/",
      Карта: "/evial-chronicle/places/",
      GitHub: "https://github.com/Luxwestp3/evial-chronicle",
    },
  }),
}

// components for pages that display a single page (e.g. a single note)
export const defaultContentPageLayout: PageLayout = {
  beforeBody: [
    Component.ConditionalRender({
      component: Component.Breadcrumbs({ rootName: "Главная" }),
      condition: (page) => page.fileData.slug !== "index",
    }),
    Component.ArticleTitle(),
    Component.ContentMeta(),
    Component.TagList(),
  ],
  left: [
    Component.PageTitle(),
    Component.MobileOnly(Component.Spacer()),
    Component.Flex({
      components: [
        {
          Component: Component.Search(),
          grow: true,
        },
        { Component: Component.Darkmode() },
        { Component: Component.ReaderMode() },
      ],
    }),
    Component.Explorer({
      // Only the six sections; loose root pages (goals, relationships, timeline...) live inside them.
      filterFn: (node) => node.slugSegment !== "tags" && (node.isFolder || node.slug.includes("/")),
      sortFn: (a, b) => {
        const order = ["sessions", "characters", "places", "factions", "lore", "rules", "pc", "npc"]
        const ia = order.indexOf(a.slugSegment)
        const ib = order.indexOf(b.slugSegment)
        if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
        if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1
        return a.displayName.localeCompare(b.displayName, "ru", { numeric: true })
      },
    }),
  ],
  right: [
    Component.Graph(),
    Component.DesktopOnly(Component.TableOfContents()),
    Component.Backlinks(),
  ],
}

// components for pages that display lists of pages  (e.g. tags or folders)
export const defaultListPageLayout: PageLayout = {
  beforeBody: [
    Component.Breadcrumbs({ rootName: "Главная" }),
    Component.ArticleTitle(),
    Component.ContentMeta(),
  ],
  left: [
    Component.PageTitle(),
    Component.MobileOnly(Component.Spacer()),
    Component.Flex({
      components: [
        {
          Component: Component.Search(),
          grow: true,
        },
        { Component: Component.Darkmode() },
      ],
    }),
    Component.Explorer({
      // Only the six sections; loose root pages (goals, relationships, timeline...) live inside them.
      filterFn: (node) => node.slugSegment !== "tags" && (node.isFolder || node.slug.includes("/")),
      sortFn: (a, b) => {
        const order = ["sessions", "characters", "places", "factions", "lore", "rules", "pc", "npc"]
        const ia = order.indexOf(a.slugSegment)
        const ib = order.indexOf(b.slugSegment)
        if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
        if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1
        return a.displayName.localeCompare(b.displayName, "ru", { numeric: true })
      },
    }),
  ],
  right: [],
}
