# Neo4j Aura Setup

## Purpose

Neo4j Aura is used for the GreenTrip AI Knowledge Graph and future fact-based "Why this place?" explanations. This Sprint 1 task is limited to infrastructure setup, connection configuration, and a safe read-only connectivity check.

## Instance

Recommended development instance name:

- greentrip-ai-kg-dev

Use Neo4j AuraDB, not AuraDS.

## Required environment variables

The backend must receive these values from local environment variables or a local .env file:

```env
NEO4J_URI=neo4j+s://YOUR_INSTANCE_ID.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=YOUR_NEO4J_PASSWORD
NEO4J_DATABASE=neo4j
```

## Local setup

Create a local .env file in the project root or backend folder and store the real credentials there only on your own machine. Do not commit this file or share it in Git.

```env
NEO4J_URI=neo4j+s://YOUR_INSTANCE_ID.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=YOUR_REAL_PASSWORD
NEO4J_DATABASE=neo4j
```

Do not put real credentials into .env.example or source files.

## Connection test

From the repository root, run:

```bash
python backend/scripts/test_neo4j_connection.py
```

A successful read-only connection should print:

```text
Neo4j Aura connection: OK
```

## Render configuration

When the FastAPI backend is deployed on Render, add these variables to the backend service environment settings:

- NEO4J_URI
- NEO4J_USERNAME
- NEO4J_PASSWORD
- NEO4J_DATABASE

Keep them as deployment secrets. Do not expose them to the React frontend or commit them to Git.

## Security notes

- never commit .env
- never expose the password to the frontend
- never log the Neo4j password
- rotate the password if it is accidentally exposed
- do not create schema or sample graph data in Sprint 1

## Manual Aura creation

If the user has not yet created the Neo4j Aura instance, they must do so in the Neo4j Aura console and then provide the real environment values.

Minimum manual actions:

1. Sign in to the Neo4j Aura Console.
2. Create a new AuraDB instance.
3. Use the name greentrip-ai-kg-dev.
4. Choose the free tier if available.
5. Copy the connection URI, username, password, and database name.
6. Save them only in local environment secrets.
