export const DispatchController = {
    // POST /api/dispatch/matrix
    getMatrix: async (req, res) => {
        const { targetLat, targetLng, activeFleet } = req.body;
        if (!activeFleet || activeFleet.length === 0) return res.json({ rankings: [] });
        try {
            const coordsString =
                `${targetLng},${targetLat};` + activeFleet.map((d) => `${d.lng},${d.lat}`).join(';');
            const response = await fetch(
                `http://router.project-osrm.org/table/v1/driving/${coordsString}?sources=0&annotations=duration,distance`
            );
            const matrixData = await response.json();
            if (matrixData.code !== 'Ok') throw new Error('OSRM matrix calculations failed to compile.');

            const distances = matrixData.distances[0];
            const durations = matrixData.durations[0];
            const rankings = activeFleet
                .map((driver, index) => {
                    const distanceKm = parseFloat(((distances[index + 1] || 0) / 1000).toFixed(2));
                    const etaMinutes = Math.round((durations[index + 1] || 0) / 60);
                    return { driverName: driver.driverName, distanceKm, etaMinutes };
                })
                .sort((a, b) => a.distanceKm - b.distanceKm);

            res.json({ rankings });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },
};
