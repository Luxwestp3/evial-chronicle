import { QuartzConfig } from "./quartz/cfg"
import * as Plugin from "./quartz/plugins"

/**
 * Quartz 4 Configuration
 *
 * See https://quartz.jzhao.xyz/configuration for more information.
 */
const config: QuartzConfig = {
  configuration: {
    pageTitle: "Хроники Эвиала",
    pageTitleSuffix: "",
    enableSPA: true,
    enablePopovers: true,
    analytics: null,
    locale: "ru-RU",
    baseUrl: "luxwestp3.github.io/evial-chronicle",
    ignorePatterns: ["private", "templates", ".obsidian", "transcripts"],
    defaultDateType: "modified",
    theme: {
      fontOrigin: "googleFonts",
      cdnCaching: true,
      typography: {
        header: "Lora",
        body: "PT Sans",
        code: "IBM Plex Mono",
      },
      colors: {
        lightMode: {
          light: "#faf6ec",
          lightgray: "#e6dcc6",
          gray: "#b3a586",
          darkgray: "#4a3f2e",
          dark: "#2a2116",
          secondary: "#8f2d1d",
          tertiary: "#b0883a",
          highlight: "rgba(176, 136, 58, 0.14)",
          textHighlight: "#fff23688",
        },
        darkMode: {
          light: "#1a1714",
          lightgray: "#3a332a",
          gray: "#7a6e5c",
          darkgray: "#d9cfbd",
          dark: "#f0e8d8",
          secondary: "#e0866a",
          tertiary: "#d4ad5c",
          highlight: "rgba(212, 173, 92, 0.12)",
          textHighlight: "#b3aa0288",
        },
      },
    },
  },
  plugins: {
    transformers: [
      Plugin.FrontMatter(),
      Plugin.CreatedModifiedDate({
        priority: ["frontmatter", "git", "filesystem"],
      }),
      Plugin.SyntaxHighlighting({
        theme: {
          light: "github-light",
          dark: "github-dark",
        },
        keepBackground: false,
      }),
      Plugin.ObsidianFlavoredMarkdown({ enableInHtmlEmbed: false }),
      Plugin.GitHubFlavoredMarkdown(),
      Plugin.TableOfContents(),
      Plugin.CrawlLinks({ markdownLinkResolution: "relative" }),
      Plugin.Description(),
      Plugin.Latex({ renderEngine: "katex" }),
    ],
    filters: [Plugin.RemoveDrafts()],
    emitters: [
      Plugin.AliasRedirects(),
      Plugin.ComponentResources(),
      Plugin.ContentPage(),
      Plugin.FolderPage(),
      Plugin.TagPage(),
      Plugin.ContentIndex({
        enableSiteMap: true,
        enableRSS: true,
      }),
      Plugin.Assets(),
      Plugin.Static(),
      Plugin.Favicon(),
      Plugin.NotFoundPage(),
    ],
  },
}

export default config
