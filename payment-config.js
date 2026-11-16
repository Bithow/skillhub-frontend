/**
 * SkillHub Payment Configuration
 * ================================
 * All payment account numbers are defined here in ONE place.
 * To update a number, change it here only — all pages pick it up automatically.
 */

var SKILLHUB_PAYMENT_METHODS = [
  {
    country: 'ET',
    flag: '🇪🇹',
    label: 'Ethiopia',
    methods: [
      {
        id: 'telebirr',
        name: 'Telebirr',
        number: '0989616976',
        display: '0989616976',
        icon: 'fa-mobile-alt',
        iconClass: 'icon-telebirr'
      },
      {
        id: 'cbe',
        name: 'CBE Bank Transfer',
        number: '1000600549085',
        display: 'Account: 1000600549085',
        icon: 'fa-university',
        iconClass: 'icon-cbe'
      }
    ]
  },
  {
    country: 'UG',
    flag: '🇺🇬',
    label: 'Uganda',
    methods: [
      {
        id: 'mtn-ug',
        name: 'MTN Mobile Money',
        number: '0783999418',
        display: '0783999418',
        icon: 'fa-mobile-alt',
        iconClass: 'icon-mtn'
      }
    ]
  },
  {
    country: 'SS',
    flag: '🇸🇸',
    label: 'South Sudan',
    methods: [
      {
        id: 'mtn-ss',
        name: 'MTN Mobile Money (Uganda)',
        number: '0783999418',
        display: '+256 783 999 418 (Uganda MTN)',
        note: '⚠️ No local South Sudan method yet. Send to this Uganda MTN number via cross-border transfer. Use your full name as the reference so we can match your payment.',
        icon: 'fa-mobile-alt',
        iconClass: 'icon-mtn'
      }
    ]
  },
  {
    country: 'KE',
    flag: '🇰🇪',
    label: 'Kenya',
    methods: [
      {
        id: 'mpesa',
        name: 'M-Pesa',
        number: '+254714865444',
        display: '+254714865444',
        icon: 'fa-mobile-alt',
        iconClass: 'icon-mpesa'
      }
    ]
  },
  {
    country: 'INTL',
    flag: '🌍',
    label: 'International',
    methods: [
      {
        id: 'wu',
        name: 'Western Union / WorldRemit',
        number: '+254714865444',
        display: 'Send to Kenya M-Pesa: 0714865444',
        icon: 'fa-globe',
        iconClass: 'icon-wu'
      }
    ]
  }
];

/* Helper — get a flat list of all methods */
var SKILLHUB_ALL_METHODS = SKILLHUB_PAYMENT_METHODS.reduce(function(acc, group) {
  return acc.concat(group.methods.map(function(m) {
    return Object.assign({}, m, { countryFlag: group.flag, countryLabel: group.label });
  }));
}, []);
