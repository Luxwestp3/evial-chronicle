import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"
import style from "./styles/contentMeta.scss"

// Sessions carry the real play date in frontmatter (`date_real`), not the git
// modification date. Other pages hide the meta line entirely.
const SessionDate: QuartzComponent = ({ fileData, displayClass }: QuartzComponentProps) => {
  const date = fileData.frontmatter?.date_real
  if (!date) {
    return null
  }
  return (
    <p class={classNames(displayClass, "content-meta", "session-date")}>
      <span>{String(date)}</span>
    </p>
  )
}

SessionDate.css = style

export default (() => SessionDate) satisfies QuartzComponentConstructor
