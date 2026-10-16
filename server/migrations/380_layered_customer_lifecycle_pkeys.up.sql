ALTER TABLE lead_opportunity
    ADD CONSTRAINT lead_opportunity_pkey PRIMARY KEY USING INDEX lead_opportunity_pkey;

ALTER TABLE lead_assessment
    ADD CONSTRAINT lead_assessment_pkey PRIMARY KEY USING INDEX lead_assessment_pkey;

ALTER TABLE service_engagement
    ADD CONSTRAINT service_engagement_pkey PRIMARY KEY USING INDEX service_engagement_pkey;
