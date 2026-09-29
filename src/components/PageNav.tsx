import type { MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import BiLabel from './BiLabel';
import type { PageName } from './pageNames';
import './PageNav.css';

export interface PageNavItem extends PageName {
  to: string;
  /** Draw a back arrow before the label ("← Library"). */
  back?: boolean;
}

export interface PageNavProps {
  items: readonly PageNavItem[];
  /** Runs before leaving (the editor asks about unsaved changes). */
  onNavigate?: (event: MouseEvent<HTMLAnchorElement>) => void;
}

/** The row of page links at the top of a page, each label bilingual. */
export default function PageNav({ items, onNavigate }: PageNavProps) {
  return (
    <nav className="page-nav">
      {items.map((item) => (
        <Link key={item.to} className="page-nav-link" to={item.to} onClick={onNavigate}>
          {item.back ? (
            <span className="page-nav-arrow" aria-hidden="true">
              ←
            </span>
          ) : null}
          <BiLabel ko={item.ko} en={item.en} />
        </Link>
      ))}
    </nav>
  );
}
