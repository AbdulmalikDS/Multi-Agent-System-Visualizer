# Multi-Agent System Visualizer

A 3D visualization tool for multi-agent research systems with real-time interaction modeling.

## Features

- 3D architectural visualization of multi-agent systems
- Real-time agent interactions and task flow
- Embedding space visualization
- Research result export and analysis
- WebSocket-based communication

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Open your browser and navigate to the displayed URL

## Usage

1. Enter a research topic in the search field
2. Watch the 3D visualization show agent interactions
3. View the embedding space in the top panel
4. Export research results using the Export button

## Architecture

The system uses multiple specialized agents:
- Lead Orchestrator: Coordinates all research activities
- Memory Database: Stores context and research data  
- Tools Database: Manages API tools and resources
- Search Agents: Perform parallel information retrieval
- Citations Agent: Validates sources and references
- Synthesis Agent: Analyzes and synthesizes findings

## Tech Stack

- Three.js for 3D visualization
- WebSocket for real-time communication
- Node.js backend with Express
- Astro framework integration

## Export Format

Research results can be exported as structured data including:
- Search results and sources
- Agent analysis and insights
- Academic citations
- Visualization statistics
