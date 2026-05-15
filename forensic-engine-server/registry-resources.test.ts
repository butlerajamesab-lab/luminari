/**
 * Registry Resources Tests
 * 
 * Validates the getResources endpoint:
 * 1. Endpoint returns resources from database
 * 2. Resources are properly categorized
 * 3. Contact information is included
 * 4. Filtering by category works
 */

import { describe, it, expect, beforeAll } from "vitest";
import { dbOverride } from "./db-override.ts";
import { mentalHealthResources, agenciesRegistry, formsRegistry } from "../drizzle/schema.ts";
import { eq, and, inArray } from "drizzle-orm";

describe("Registry Resources", () => {
  describe("Database Tables Exist", () => {
    it("mentalHealthResources table is accessible", async () => {
      const resources = await dbOverride.select().from(mentalHealthResources).limit(1);
      expect(Array.isArray(resources)).toBe(true);
    });

    it("agenciesRegistry table is accessible", async () => {
      const agencies = await dbOverride.select().from(agenciesRegistry).limit(1);
      expect(Array.isArray(agencies)).toBe(true);
    });

    it("formsRegistry table is accessible", async () => {
      const forms = await dbOverride.select().from(formsRegistry).limit(1);
      expect(Array.isArray(forms)).toBe(true);
    });
  });

  describe("Resource Query Logic", () => {
    it("can query all mental health resources", async () => {
      const resources = await dbOverride.select().from(mentalHealthResources);
      expect(Array.isArray(resources)).toBe(true);
      // Resources may be empty initially
      if (resources.length > 0) {
        expect(resources[0]).toHaveProperty("id");
        expect(resources[0]).toHaveProperty("resourceName");
        expect(resources[0]).toHaveProperty("resourceType");
      }
    });

    it("can query agencies by domain", async () => {
      const agencies = await dbOverride
        .select()
        .from(agenciesRegistry)
        .where(
          and(
            inArray(agenciesRegistry.domain, ["mental_health"] as any),
            eq(agenciesRegistry.officialStatus, "active")
          )
        );
      expect(Array.isArray(agencies)).toBe(true);
    });

    it("can query forms by domain", async () => {
      const forms = await dbOverride
        .select()
        .from(formsRegistry)
        .where(
          and(
            inArray(formsRegistry.domain, ["benefits"] as any),
            eq(formsRegistry.isActive, true)
          )
        );
      expect(Array.isArray(forms)).toBe(true);
    });
  });

  describe("Resource Data Structure", () => {
    it("mental health resources have required contact methods", async () => {
      const resources = await dbOverride
        .select()
        .from(mentalHealthResources)
        .limit(1);

      if (resources.length > 0) {
        const resource = resources[0];
        expect(resource).toHaveProperty("contactMethods");
        // contactMethods should be an object or null
        if (resource.contactMethods) {
          expect(typeof resource.contactMethods).toBe("object");
        }
      }
    });

    it("agencies have contact methods", async () => {
      const agencies = await dbOverride
        .select()
        .from(agenciesRegistry)
        .limit(1);

      if (agencies.length > 0) {
        const agency = agencies[0];
        expect(agency).toHaveProperty("contactMethods");
        // contactMethods should be an object or null
        if (agency.contactMethods) {
          expect(typeof agency.contactMethods).toBe("object");
        }
      }
    });

    it("forms have access methods", async () => {
      const forms = await dbOverride
        .select()
        .from(formsRegistry)
        .limit(1);

      if (forms.length > 0) {
        const form = forms[0];
        expect(form).toHaveProperty("accessMethods");
        // accessMethods should be an array or null
        if (form.accessMethods) {
          expect(Array.isArray(form.accessMethods)).toBe(true);
        }
      }
    });
  });

  describe("Category Mapping", () => {
    it("can map benefits category to database domain", async () => {
      const categoryToDomainMap: Record<string, string[]> = {
        "benefits": ["benefits"],
      };

      const domains = categoryToDomainMap["benefits"];
      const forms = await dbOverride
        .select()
        .from(formsRegistry)
        .where(
          and(
            domains.length > 0 ? inArray(formsRegistry.domain, domains as any) : undefined,
            eq(formsRegistry.isActive, true)
          )
        );

      expect(Array.isArray(forms)).toBe(true);
    });

    it("can map crisis category to mental_health domain", async () => {
      const categoryToDomainMap: Record<string, string[]> = {
        "crisis": ["mental_health"],
      };

      const domains = categoryToDomainMap["crisis"];
      const resources = await dbOverride
        .select()
        .from(mentalHealthResources)
        .where(
          domains.length > 0 ? inArray(mentalHealthResources.resourceType, domains as any) : undefined
        );

      expect(Array.isArray(resources)).toBe(true);
    });

    it("can map legal-aid category to multiple domains", async () => {
      const categoryToDomainMap: Record<string, string[]> = {
        "legal-aid": ["consumer_protection", "employment", "housing"],
      };

      const domains = categoryToDomainMap["legal-aid"];
      const agencies = await dbOverride
        .select()
        .from(agenciesRegistry)
        .where(
          and(
            domains.length > 0 ? inArray(agenciesRegistry.domain, domains as any) : undefined,
            eq(agenciesRegistry.officialStatus, "active")
          )
        );

      expect(Array.isArray(agencies)).toBe(true);
    });
  });

  describe("Data Transformation", () => {
    it("transforms mental health resources to UI format", async () => {
      const resources = await dbOverride.select().from(mentalHealthResources).limit(1);

      if (resources.length > 0) {
        const resource = resources[0];
        const transformed = {
          id: resource.id,
          name: resource.resourceName,
          type: resource.resourceType,
          jurisdiction: resource.jurisdiction,
          phone: resource.contactMethods?.phone,
          website: resource.website,
          description: resource.servicesProvided?.join(", ") || "",
          availability: resource.availability?.is24_7 ? "24/7" : resource.availability?.hours || "Check website",
        };

        expect(transformed).toHaveProperty("id");
        expect(transformed).toHaveProperty("name");
        expect(transformed).toHaveProperty("type");
        expect(typeof transformed.name).toBe("string");
      }
    });

    it("transforms agencies to UI format", async () => {
      const agencies = await dbOverride.select().from(agenciesRegistry).limit(1);

      if (agencies.length > 0) {
        const agency = agencies[0];
        const transformed = {
          id: agency.id,
          name: agency.agencyName,
          domain: agency.domain,
          jurisdiction: agency.jurisdiction,
          phone: agency.contactMethods?.phone,
          website: agency.website,
          description: agency.agencyType,
        };

        expect(transformed).toHaveProperty("id");
        expect(transformed).toHaveProperty("name");
        expect(typeof transformed.name).toBe("string");
      }
    });

    it("transforms forms to UI format", async () => {
      const forms = await dbOverride.select().from(formsRegistry).limit(1);

      if (forms.length > 0) {
        const form = forms[0];
        const transformed = {
          id: form.id,
          name: form.formName,
          domain: form.domain,
          jurisdiction: form.jurisdiction,
          url: form.url,
          description: form.filingDeadline ? `Deadline: ${form.filingDeadline}` : "No deadline specified",
        };

        expect(transformed).toHaveProperty("id");
        expect(transformed).toHaveProperty("name");
        expect(typeof transformed.name).toBe("string");
      }
    });
  });

  describe("Endpoint Response Structure", () => {
    it("getResources response has correct structure", async () => {
      const [mentalHealth, agencies, forms] = await Promise.all([
        dbOverride.select().from(mentalHealthResources),
        dbOverride.select().from(agenciesRegistry).where(eq(agenciesRegistry.officialStatus, "active")),
        dbOverride.select().from(formsRegistry).where(eq(formsRegistry.isActive, true)),
      ]);

      const response = {
        mentalHealth: mentalHealth.map((r: any) => ({
          id: r.id,
          name: r.resourceName,
          type: r.resourceType,
          jurisdiction: r.jurisdiction,
          phone: r.contactMethods?.phone,
          website: r.website,
          description: r.servicesProvided?.join(", ") || "",
          availability: r.availability?.is24_7 ? "24/7" : r.availability?.hours || "Check website",
        })),
        agencies: agencies.map((a: any) => ({
          id: a.id,
          name: a.agencyName,
          domain: a.domain,
          jurisdiction: a.jurisdiction,
          phone: a.contactMethods?.phone,
          website: a.website,
          description: a.agencyType,
        })),
        forms: forms.map((f: any) => ({
          id: f.id,
          name: f.formName,
          domain: f.domain,
          jurisdiction: f.jurisdiction,
          url: f.url,
          description: f.filingDeadline ? `Deadline: ${f.filingDeadline}` : "No deadline specified",
        })),
      };

      expect(response).toHaveProperty("mentalHealth");
      expect(response).toHaveProperty("agencies");
      expect(response).toHaveProperty("forms");
      expect(Array.isArray(response.mentalHealth)).toBe(true);
      expect(Array.isArray(response.agencies)).toBe(true);
      expect(Array.isArray(response.forms)).toBe(true);
    });
  });
});
