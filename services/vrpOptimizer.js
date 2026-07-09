/**
 * Vehicle Routing Problem (VRP) & Multi-Stop Optimizer Service
 * Features:
 * - Haversine distance matrix generation
 * - Nearest Neighbor initial tour construction
 * - Capacity constraint enforcement per vehicle route
 * - 2-Opt local search post-processing to eliminate path crossings
 */

// Helper: Convert degrees to radians
function toRad(deg) {
    return (deg * Math.PI) / 180;
  }
  
  // Helper: Calculate great-circle distance in kilometers between two lat/lng points
  function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the Earth in km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
  
  // Compute total route distance
  function getRouteDistance(route, distanceMatrix) {
    let dist = 0;
    for (let i = 0; i < route.length - 1; i++) {
      dist += distanceMatrix[route[i]][route[i + 1]];
    }
    return dist;
  }
  
  // 2-Opt optimization algorithm to uncross routes and shorten total distance
  function optimize2Opt(route, distanceMatrix) {
    let bestRoute = [...route];
    let improved = true;
    let bestDistance = getRouteDistance(bestRoute, distanceMatrix);
  
    while (improved) {
      improved = false;
      for (let i = 1; i < bestRoute.length - 2; i++) {
        for (let j = i + 1; j < bestRoute.length - 1; j++) {
          // Reverse the sub-segment between i and j
          const newRoute = [
            ...bestRoute.slice(0, i),
            ...bestRoute.slice(i, j + 1).reverse(),
            ...bestRoute.slice(j + 1)
          ];
          
          const newDistance = getRouteDistance(newRoute, distanceMatrix);
          if (newDistance < bestDistance) {
            bestRoute = newRoute;
            bestDistance = newDistance;
            improved = true;
          }
        }
      }
    }
    return { route: bestRoute, distance: bestDistance };
  }
  
  /**
   * Optimizes multi-stop deliveries for a single or multiple vehicles
   * @param {Object} options
   * @param {Object} options.depot - { id, lat, lng } starting warehouse/hub
   * @param {Array} options.stops - Array of { id, lat, lng, demand } delivery points
   * @param {Number} options.vehicleCapacity - Max capacity load allowed per vehicle run
   */
  export function solveVRP({ depot, stops, vehicleCapacity = 100 }) {
    // Combine depot (index 0) and all stops into a single managed node list
    const nodes = [depot, ...stops];
    const n = nodes.length;
  
    // Build an N x N distance matrix in kilometers
    const distanceMatrix = Array.from({ length: n }, () => Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i !== j) {
          distanceMatrix[i][j] = calculateDistance(
            nodes[i].lat, nodes[i].lng,
            nodes[j].lat, nodes[j].lng
          );
        }
      }
    }
  
    // Split stops into clusters if capacity limits are breached
    const unvisited = new Set(Array.from({ length: stops.length }, (_, i) => i + 1)); // 0 is depot
    const routes = [];
  
    while (unvisited.size > 0) {
      let currentLoad = 0;
      let currentNode = 0; // Start at depot
      const currentRoute = [0];
  
      while (true) {
        let nearestNode = null;
        let minDistance = Infinity;
  
        for (const nextNode of unvisited) {
          const demand = stops[nextNode - 1].demand || 1;
          // Verify capacity constraint
          if (currentLoad + demand <= vehicleCapacity) {
            const dist = distanceMatrix[currentNode][nextNode];
            if (dist < minDistance) {
              minDistance = dist;
              nearestNode = nextNode;
            }
          }
        }
  
        // If no valid unvisited node fits remaining capacity, break to return to depot
        if (nearestNode === null) break;
  
        currentLoad += stops[nearestNode - 1].demand || 1;
        currentRoute.push(nearestNode);
        unvisited.delete(nearestNode);
        currentNode = nearestNode;
      }
  
      // Return back to depot
      currentRoute.push(0);
  
      // Apply 2-opt post-processing optimization on this sub-route
      const optimized = optimize2Opt(currentRoute, distanceMatrix);
  
      // Map indices back to actual node objects for frontend/controller consumption
      const resolvedNodes = optimized.route.map((idx) => nodes[idx]);
      
      routes.push({
        sequence: resolvedNodes,
        totalDistanceKm: parseFloat(optimized.distance.toFixed(2)),
        totalLoad: currentLoad
      });
    }
  
    return {
      routes,
      summary: {
        totalVehiclesNeeded: routes.length,
        aggregateDistanceKm: parseFloat(routes.reduce((acc, r) => acc + r.totalDistanceKm, 0).toFixed(2))
      }
    };
  }