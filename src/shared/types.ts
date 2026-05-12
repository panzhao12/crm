export type Contact = {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  headline: string;
  company: string;
  position: string;
  location: string;
  email: string;
  profileUrl: string;
  profileImage: string;
  connectedOn: string;
  tags: string[];
  group: string;
  category: string;
  notes: string;
  nextFollowUp: string;
  createdAt: string;
  updatedAt: string;
};

export type ContactPatch = Partial<Omit<Contact, "id" | "createdAt">> & {
  id: string;
};

export type CsvImportResult = {
  created: number;
  updated: number;
  skipped: number;
};
