/**
 * L7 Claim Validation Layer - Public Record Connectors
 * 
 * Interfaces and implementations for querying public records:
 * - King County Recorder (deed records)
 * - Washington Secretary of State (business filings, UCC)
 * - WHOIS (domain registration)
 * - Case law database
 */

/**
 * King County Recorder Connector
 * Queries deed records by address and parties
 */
export interface IKingCountyRecorder {
  getDeedsByAddress(address: string): Promise<DeedRecord[]>;
  getDeedsByParty(partyName: string): Promise<DeedRecord[]>;
  getTransferHistory(address: string): Promise<DeedRecord[]>;
}

export interface DeedRecord {
  deedNumber: string;
  recordDate: Date;
  grantor: string; // Seller
  grantee: string; // Buyer
  propertyAddress: string;
  considerationAmount?: number;
  documentType: string;
  volume: string;
  page: number;
  rawData: any;
}

/**
 * Washington Secretary of State Connector
 * Queries business filings and UCC records
 */
export interface IWashingtonSOS {
  getBusinessByUbi(ubi: string): Promise<BusinessFiling>;
  getBusinessByName(name: string): Promise<BusinessFiling[]>;
  getUCCFilingsByParty(partyName: string): Promise<UCCFiling[]>;
  getUCCFilingsByCollateral(collateral: string): Promise<UCCFiling[]>;
}

export interface BusinessFiling {
  ubi: string;
  businessName: string;
  businessType: string; // LLC, Corporation, etc.
  status: string; // Active, Dissolved, etc.
  formationDate: Date;
  dissolutionDate?: Date;
  principalAddress: string;
  mailingAddress: string;
  officers: Officer[];
  managers?: Officer[];
  members?: Officer[];
  rawData: any;
}

export interface Officer {
  name: string;
  title: string;
  address?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface UCCFiling {
  filingNumber: string;
  filingDate: Date;
  debtor: string;
  securedParty: string;
  collateral: string;
  status: string; // Active, Lapsed, etc.
  expirationDate?: Date;
  rawData: any;
}

/**
 * WHOIS Connector
 * Queries domain registration records
 */
export interface IWhoisConnector {
  getDomain(domain: string): Promise<WhoisRecord>;
  getRegistrant(registrantEmail: string): Promise<WhoisRecord[]>;
}

export interface WhoisRecord {
  domain: string;
  registrant: string;
  registrantEmail: string;
  registrantPhone?: string;
  registrationDate: Date;
  expirationDate: Date;
  nameservers: string[];
  registrar: string;
  status: string;
  rawData: any;
}

/**
 * Case Law Database Connector
 * Queries case law and statutory references
 */
export interface ICaseLawConnector {
  findByStatute(statute: string, keywords: string[]): Promise<CaseLawRecord[]>;
  findByKeywords(keywords: string[]): Promise<CaseLawRecord[]>;
  getStatuteText(statute: string): Promise<StatuteRecord>;
}

export interface CaseLawRecord {
  caseName: string;
  citation: string;
  court: string;
  year: number;
  holdingText: string;
  relevantStatutes: string[];
  keywords: string[];
  url?: string;
  rawData: any;
}

export interface StatuteRecord {
  statute: string;
  title: string;
  text: string;
  effectiveDate: Date;
  lastAmendedDate?: Date;
  relatedStatutes: string[];
  url?: string;
}

/**
 * Mock implementations for testing
 */
export class MockKingCountyRecorder implements IKingCountyRecorder {
  async getDeedsByAddress(address: string): Promise<DeedRecord[]> {
    // Mock implementation
    return [
      {
        deedNumber: 'KC-2026-001234',
        recordDate: new Date('2026-01-15'),
        grantor: 'Renaissance 21 Childcare (UBI: 603-xxx-xxx)',
        grantee: 'R21 Logistics & Care (UBI: 605777111)',
        propertyAddress: address,
        considerationAmount: 0,
        documentType: 'Quitclaim Deed',
        volume: '12345',
        page: 67,
        rawData: {},
      },
    ];
  }

  async getDeedsByParty(partyName: string): Promise<DeedRecord[]> {
    return [];
  }

  async getTransferHistory(address: string): Promise<DeedRecord[]> {
    return this.getDeedsByAddress(address);
  }
}

export class MockWashingtonSOS implements IWashingtonSOS {
  async getBusinessByUbi(ubi: string): Promise<BusinessFiling> {
    // Mock implementation
    return {
      ubi,
      businessName: 'R21 Logistics & Care',
      businessType: 'LLC',
      status: 'Active',
      formationDate: new Date('2026-02-01'),
      principalAddress: '1234 SECTOR 7G, SEATTLE, WA 98101',
      mailingAddress: '1234 SECTOR 7G, SEATTLE, WA 98101',
      officers: [
        {
          name: 'Julian Saint Clair',
          title: 'Manager',
          startDate: new Date('2026-02-01'),
        },
        {
          name: 'Robert Doe',
          title: 'Registered Agent',
          startDate: new Date('2026-02-01'),
        },
      ],
      rawData: {},
    };
  }

  async getBusinessByName(name: string): Promise<BusinessFiling[]> {
    return [];
  }

  async getUCCFilingsByParty(partyName: string): Promise<UCCFiling[]> {
    return [];
  }

  async getUCCFilingsByCollateral(collateral: string): Promise<UCCFiling[]> {
    return [];
  }
}

export class MockWhoisConnector implements IWhoisConnector {
  async getDomain(domain: string): Promise<WhoisRecord> {
    // Mock implementation
    return {
      domain,
      registrant: 'Julian Saint Clair',
      registrantEmail: 'julian@r21logistics.com',
      registrationDate: new Date('2026-02-05'),
      expirationDate: new Date('2027-02-05'),
      nameservers: ['ns1.example.com', 'ns2.example.com'],
      registrar: 'GoDaddy',
      status: 'Active',
      rawData: {},
    };
  }

  async getRegistrant(registrantEmail: string): Promise<WhoisRecord[]> {
    return [];
  }
}

export class MockCaseLawConnector implements ICaseLawConnector {
  async findByStatute(statute: string, keywords: string[]): Promise<CaseLawRecord[]> {
    // Mock implementation
    if (statute === 'RCW 43.20A.435') {
      return [
        {
          caseName: 'State v. Successor Entity Corp.',
          citation: '123 Wash. 2d 456',
          court: 'Washington Supreme Court',
          year: 2020,
          holdingText: 'Successor entities are liable for predecessor debts under RCW 43.20A.435',
          relevantStatutes: ['RCW 43.20A.435', 'RCW 19.86.140'],
          keywords: ['successor', 'liability', 'asset transfer'],
          url: 'https://courts.wa.gov/...',
          rawData: {},
        },
      ];
    }
    return [];
  }

  async findByKeywords(keywords: string[]): Promise<CaseLawRecord[]> {
    return [];
  }

  async getStatuteText(statute: string): Promise<StatuteRecord> {
    // Mock implementation
    return {
      statute,
      title: 'Liability for Successor Entities',
      text: 'Any person or entity that succeeds to the business of a provider...',
      effectiveDate: new Date('2010-01-01'),
      relatedStatutes: ['RCW 19.86.140'],
      url: 'https://app.leg.wa.gov/...',
    };
  }
}
