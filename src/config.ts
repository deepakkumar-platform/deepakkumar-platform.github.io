export const SITE = {
  title: 'Deepak Kumar',
  description: 'Cloud, DevOps and AI, written from production: which service to pick, why systems break, and what AI actually changes for engineers.',
  tagline: 'DevOps, cloud and AI',
  author: 'Deepak Kumar',
  linkedin: 'https://www.linkedin.com/in/deepakkumar2o',
  github: 'https://github.com/deepakkumar-platform',
  topmate: 'https://topmate.io/deepakkumar2o',
  ogImage: '/og-outages.png',
};

// Off until a provider is picked. Buttondown and Substack both accept a plain HTML form post,
// so the site stays static. Set enabled: true and fill action + the email field name.
export const NEWSLETTER = {
  enabled: false,
  provider: '' as '' | 'buttondown' | 'substack',
  action: '',
  emailField: 'email',
};
