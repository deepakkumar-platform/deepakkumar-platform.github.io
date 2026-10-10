export const SITE = {
  title: 'Deepak Kumar',
  description: 'Notes from a DevOps engineer on cloud decisions, outages and fixing things in production.',
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
