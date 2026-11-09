#!/bin/bash
# Fetch OSM map data for inner Brisbane in small tiles from the OSM API.
D=${1:-osm/tiles}; mkdir -p $D
cd $D
W=152.995; S=-27.497; DX=0.011; DY=0.0095
for i in 0 1 2 3 4; do for j in 0 1 2 3 4 5; do
  x0=$(python3 -c "print(round($W+$i*$DX,5))"); x1=$(python3 -c "print(round($W+($i+1)*$DX,5))")
  y0=$(python3 -c "print(round($S+$j*$DY,5))"); y1=$(python3 -c "print(round($S+($j+1)*$DY,5))")
  f=t_${i}_${j}.osm
  [ -s $f ] && grep -q "</osm>" $f && continue
  for try in 1 2 3; do
    code=$(curl -s --max-time 180 -A "brisbane-5-game-research/1.0" "https://api.openstreetmap.org/api/0.6/map?bbox=$x0,$y0,$x1,$y1" -o $f -w "%{http_code}")
    echo "$f $code $(stat -c %s $f 2>/dev/null)"
    [ "$code" = "200" ] && break
    sleep 5
  done
  sleep 1
done; done
echo DONE
