export const PROVIDER_FIELDS = [
  {
    key: 'GOOGLE_TRANSLATE_API_KEY',
    labelKey: 'settings.llmp_api_key',
    labelPrefix: 'Google Cloud',
    helpKey: 'settings.llmp_api_key',
    isPassword: true,
  },
  {
    key: 'MICROSOFT_REGION',
    labelKey: 'credentials.region',
    labelPrefix: 'Microsoft Azure',
    helpKey: 'credentials.region',
  },
  {
    key: 'AWS_PROFILE',
    labelKey: 'credentials.aws_profile',
    helpKey: 'credentials.aws_profile',
  },
  {
    key: 'AWS_REGION',
    labelKey: 'credentials.region',
    labelPrefix: 'AWS',
    helpKey: 'credentials.region',
  },
  {
    key: 'DEEPL_API_KEY',
    labelKey: 'credentials.deepl_key',
    placeholderKey: 'credentials.deepl_key_placeholder',
    helpKey: 'credentials.deepl_key',
    isPassword: true,
  },
  {
    key: 'DEEPL_BASE_URL',
    labelKey: 'credentials.deepl_base_url',
    placeholder: 'https://api.deepl.com/v2',
    helpKey: 'credentials.deepl_base_url_help',
  },
  {
    key: 'MICROSOFT_API_KEY',
    labelKey: 'credentials.microsoft_key',
    placeholderKey: 'credentials.microsoft_key_placeholder',
    helpKey: 'credentials.microsoft_key',
    isPassword: true,
  },
  {
    key: 'MICROSOFT_BASE_URL',
    labelKey: 'credentials.microsoft_base_url',
    placeholder: 'https://api.cognitive.microsofttranslator.com',
    helpKey: 'credentials.microsoft_base_url_help',
  },
];
