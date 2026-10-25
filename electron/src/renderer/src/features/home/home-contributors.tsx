import type { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUpRightIcon, GlobeIcon, StarIcon } from 'lucide-react';
import { GitHubIcon, XLogoIcon } from '@/components/brand-icons';
import { getBridge } from '@/components/bridge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { runRendererTask } from '@/lib/global-error-recovery';
import { REPO_URL, WEBSITE_URL, X_URL } from '@shared/utils/contactLinks';
import { homeContributors, homeCoreMaintainers } from './home-contributors-data';

function openProfile(event: MouseEvent<HTMLAnchorElement>) {
  const bridge = getBridge();
  if (!bridge) return;
  event.preventDefault();
  const href = event.currentTarget.href;
  runRendererTask('Open contributor profile', () => bridge.files.openExternal(href));
}

/** Core team hover cards: name, role and the profiles people can follow. */
const MAINTAINER_CARDS: Record<
  string,
  {
    name: string;
    role: 'homeUi.creatorCoreTeam' | 'homeUi.coreTeam';
    links: CardLink[];
  }
> = {
  debpalash: {
    name: 'Palash',
    role: 'homeUi.creatorCoreTeam',
    links: [
      { kind: 'website', handle: 'palash.dev', href: WEBSITE_URL },
      {
        kind: 'github',
        handle: '@debpalash',
        href: 'https://github.com/debpalash',
      },
      { kind: 'x', handle: '@idebpalash', href: X_URL },
    ],
  },
  velixio: {
    name: 'Velixio',
    role: 'homeUi.coreTeam',
    links: [
      {
        kind: 'github',
        handle: '@velixio',
        href: 'https://github.com/velixio',
      },
      { kind: 'x', handle: '@shimuldn', href: 'https://x.com/shimuldn' },
    ],
  },
};

type CardLink = {
  kind: 'website' | 'github' | 'x';
  handle: string;
  href: string;
};

type Credit = { login: string; avatar: string };

/** Home contributor credits: core maintainers large on top, everyone else smaller below, then All. */
export function HomeContributors() {
  const { t } = useTranslation();
  const maintainers = homeContributors.filter(({ login }) => login in MAINTAINER_CARDS);
  const others: Credit[] = [
    ...homeContributors.filter(({ login }) => !(login in MAINTAINER_CARDS)),
    { login: 'all', avatar: '' },
  ];

  const portrait = ({ login, avatar }: Credit) => {
    const coreMaintainer = homeCoreMaintainers.some((maintainer) => maintainer === login);
    return (
      <span className="home-contributor-avatar">
        {login === 'all' ? (
          <span className="home-contributor-all">{t('homeUi.all')}</span>
        ) : (
          <img src={avatar} alt="" width={56} height={56} />
        )}
        {coreMaintainer && (
          <span className="home-core-maintainer" data-core-maintainer={login} aria-hidden="true">
            <StarIcon />
          </span>
        )}
      </span>
    );
  };

  const maintainer = (credit: Credit) => {
    const card = MAINTAINER_CARDS[credit.login];
    return (
      <Popover>
        <PopoverTrigger
          openOnHover
          delay={120}
          closeDelay={250}
          render={
            <button
              type="button"
              className="home-contributor"
              aria-label={`@${credit.login}`}
              aria-description={t('homeUi.coreMaintainer')}
            />
          }
        >
          {portrait(credit)}
        </PopoverTrigger>
        <PopoverContent
          side="bottom"
          align="end"
          className="home-contributor-popup"
          aria-label={`@${credit.login}`}
        >
          <div className="home-contributor-identity">
            <img src={credit.avatar} alt="" width={40} height={40} />
            <div>
              <strong>{card.name}</strong>
              <small>{t(card.role)}</small>
            </div>
          </div>
          {card.links.map(({ kind, handle, href }) => {
            const label =
              kind === 'website' ? t('homeUi.website') : kind === 'github' ? 'GitHub' : 'X';
            const KindIcon =
              kind === 'website' ? GlobeIcon : kind === 'github' ? GitHubIcon : XLogoIcon;
            return (
              <a
                key={kind}
                data-kind={kind}
                aria-label={`${label} ${handle}`}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={openProfile}
              >
                <KindIcon className="home-contributor-link-icon" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <strong>{label}</strong>
                  <small className="truncate">{handle}</small>
                </span>
                <span className="home-contributor-follow">
                  {kind === 'website' ? (
                    <ArrowUpRightIcon className="size-3.5" aria-hidden="true" />
                  ) : (
                    t('homeUi.follow')
                  )}
                </span>
              </a>
            );
          })}
        </PopoverContent>
      </Popover>
    );
  };

  const contributor = (credit: Credit) => (
    <Tooltip>
      <TooltipTrigger
        render={
          <a
            className="home-contributor"
            href={
              credit.login === 'all'
                ? `${REPO_URL}/graphs/contributors`
                : `https://github.com/${credit.login}`
            }
            target="_blank"
            rel="noopener noreferrer"
            aria-label={
              credit.login === 'all' ? t('homeUi.allContributors') : `GitHub · @${credit.login}`
            }
            onClick={openProfile}
          />
        }
      >
        {portrait(credit)}
      </TooltipTrigger>
      <TooltipContent surface="theme" side="bottom">
        {credit.login === 'all' ? t('homeUi.allContributors') : `@${credit.login}`}
      </TooltipContent>
    </Tooltip>
  );

  return (
    <div className="home-contributors" role="list" aria-label={t('homeUi.allContributors')}>
      <ul className="home-contributors-core">
        {maintainers.map((credit) => (
          <li key={credit.login}>{maintainer(credit)}</li>
        ))}
      </ul>
      <ul className="home-contributors-rest">
        {others.map((credit) => (
          <li key={credit.login}>{contributor(credit)}</li>
        ))}
      </ul>
    </div>
  );
}
